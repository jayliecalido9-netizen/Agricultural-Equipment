import express,{type ErrorRequestHandler,type Request,type Response,type NextFunction} from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { compare,hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { z,ZodError } from 'zod';
import swaggerUi from 'swagger-ui-express';
import type { AppConfig } from './config.js';
import { authenticate,HttpError,result,uuid,text,one,permit } from './http.js';
import { registerRoutes } from './routes.js';
import { openapi } from './openapi.js';
import { withActor } from './database.js';

export function createApp(db:PrismaClient,config:AppConfig) {
  const app=express();
  app.disable('x-powered-by');
  // Trust only the configured proxy count; never trust arbitrary forwarded headers.
  app.set('trust proxy',config.TRUST_PROXY_HOPS);
  app.set('json replacer',(_key:string,value:unknown)=>typeof value==='bigint'?Number(value):value);
  app.use(helmet());
  app.use(cors({origin:config.FRONTEND_ORIGIN,credentials:true}));
  app.use((req,res,next)=>{req.requestId=randomUUID();res.setHeader('X-Request-ID',req.requestId);if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');next();});
  app.use(express.json({limit:'256kb'})); app.use(cookieParser());
  app.use('/api',rateLimit({windowMs:60000,limit:400,standardHeaders:'draft-8',legacyHeaders:false,skip:req=>req.path==='/v1/health',message:{error:{message:'Too many requests. Please try again shortly.'}}}));
  app.use('/api',(req,_res,next)=>{
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      if (req.get('X-AEAMS-Request')!=='1' || (req.get('Origin') && req.get('Origin')!==config.FRONTEND_ORIGIN)) throw new HttpError(403,'Request origin could not be verified.');
    }
    next();
  });
  app.get('/api/v1/health',async(_req,res)=>{await db.$queryRaw`SELECT 1`;res.json({status:'ok',module:'AEAMS',version:'1.0.0'});});
  app.get('/api/v1/openapi.json',(_req,res)=>res.json(openapi));
  app.use('/api-docs',(_req:Request,res:Response,next:NextFunction)=>{res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:");next();},swaggerUi.serve,swaggerUi.setup(openapi));
  const loginLimit=rateLimit({windowMs:15*60000,limit:15,standardHeaders:'draft-8',legacyHeaders:false,skipSuccessfulRequests:true,message:{error:{message:'Too many sign-in attempts. Please try again in 15 minutes.'}}});
  const dummyHash=hash('unusable-random-password-'+randomUUID(),12);
  const cookie={httpOnly:true,secure:config.COOKIE_SECURE==='true',sameSite:'strict' as const,path:'/api',maxAge:2*60*60*1000};
  app.post('/api/v1/auth/login',loginLimit,async(req,res)=>{
    const body=z.object({email:z.string().email().max(254).transform(v=>v.toLowerCase().trim()),password:z.string().min(1).max(128)}).strict().parse(req.body);
    const user=await db.user.findUnique({where:{email:body.email},include:{roles:true}});
    const valid=await compare(body.password,user?.password_hash||await dummyHash);
    if (!valid || !user || !user.active || user.archived_at || !user.roles.length) throw new HttpError(401,'Email or password is incorrect.');
    const token=jwt.sign({version:user.auth_version},config.JWT_SECRET,{subject:user.id,issuer:'aeams',audience:'aeams-web',expiresIn:'2h',algorithm:'HS256'});
    res.cookie('aeams_session',token,cookie);
    result(res,{message:'Signed in successfully.'});
  });
  app.use('/api/v1',authenticate(db,config));
  app.use('/api/v1',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  app.param('id',(req,_res,next,value)=>{uuid.parse(value);next();});
  app.get('/api/v1/auth/me',(req,res)=>{const {auth_version:_,...user}=req.actor;result(res,user);});
  app.post('/api/v1/auth/logout',async(req,res)=>{await withActor(db,req.actor.id,req.requestId,tx=>tx.user.update({where:{id:req.actor.id},data:{auth_version:{increment:1}}}));res.clearCookie('aeams_session',cookie);result(res,{message:'Signed out.'});});
  app.post('/api/v1/auth/password',async(req,res)=>{
    const body=z.object({current_password:z.string().min(1).max(128),new_password:z.string().min(16).max(128)}).strict().parse(req.body);
    const user=one(await db.user.findUnique({where:{id:req.actor.id}}));
    if (!user.password_hash || !(await compare(body.current_password,user.password_hash))) throw new HttpError(422,'Current password is incorrect.');
    const password_hash=await hash(body.new_password,12);
    await withActor(db,req.actor.id,req.requestId,tx=>tx.user.update({where:{id:user.id},data:{password_hash,auth_version:{increment:1}}}));
    res.clearCookie('aeams_session',cookie);result(res,{message:'Password updated. Sign in again.'});
  });
  registerRoutes(app,db,config);
  app.use((_req,_res,next)=>next(new HttpError(404,'Endpoint not found.')));
  const errors:ErrorRequestHandler=(error,req,res,_next)=>{
    let status=500,message='The request could not be completed. Please try again.';
    if (error instanceof HttpError) {status=error.status;message=error.message;}
    else if (error instanceof ZodError) {status=422;message=error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ');}
    else {
      // Prisma surfaces some PostgreSQL trigger/exclusion failures as UnknownRequestError.
      const code=(error.code==='P2010'?error.meta?.code:error.code)||String(error.message||'').match(/\b(23P01|23514|23503|23505|42501)\b/)?.[1];
      if (code==='23P01') {status=409;message='This equipment has a conflicting reservation, borrowing, or maintenance window.';}
      else if (['23505','P2002'].includes(code)) {status=409;message='A record with these unique details already exists.';}
      else if (['23503','P2003','P2025','P2018','P2023'].includes(code)) {status=422;message='A referenced record is missing or invalid.';}
      else if (['23514','P2004'].includes(code)||error.code==='P2004') {status=409;message='The operation conflicts with equipment condition, borrower verification, or workflow rules.';}
      else if (error.code==='LIMIT_FILE_SIZE') {status=422;message='Image must be at most 5 MB.';}
      else if (error.type==='entity.parse.failed') {status=400;message='Invalid JSON request.';}
      else if (error.type==='entity.too.large') {status=413;message='Request body is too large.';}
      else if (String(error.code||'').startsWith('LIMIT_')) {status=422;message='Invalid upload. Select one image up to 5 MB.';}
      else if (error.code==='P2010' && String(error.meta?.message).includes('23514')) {status=409;message='This workflow change violates a database business rule.';}
    }
    if (status===500) console.error(JSON.stringify({level:'error',request_id:req.requestId,code:error.code||'UNEXPECTED',route:req.path}));
    res.status(status).json({error:{message,request_id:req.requestId,...(error instanceof ZodError?{fields:error.flatten().fieldErrors}:{})}});
  };
  app.use(errors);
  return app;
}
