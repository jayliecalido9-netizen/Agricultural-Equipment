import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import type { AppConfig } from './config.js';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const uuid = z.string().uuid();
export const date = z.string().datetime({offset:true}).transform(v=>new Date(v));
export const condition = z.enum(['EXCELLENT','GOOD','FAIR','DAMAGED','UNSERVICEABLE']);
export const text = z.string().trim().min(1).max(5000);
export type Actor = { id:string; email:string; display_name:string; auth_version:number; roles:string[]; permissions:string[] };
declare global { namespace Express { interface Request { actor: Actor; requestId:string } } }
export const has = (actor:Actor,permission:string) => actor.permissions.includes(permission);
export function permit(permission:string) { return (req:Request,_res:Response,next:NextFunction)=> { if (!has(req.actor,permission)) throw new HttpError(403,'You do not have permission for this action.'); next(); }; }
export function page(req:Request) {
  const parsed = z.object({page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20),search:z.string().max(150).default(''),sort:z.enum(['asc','desc']).default('desc')}).parse(req.query);
  return {...parsed,skip:(parsed.page-1)*parsed.limit};
}
export function result(res:Response,data:unknown,total?:number,query?:ReturnType<typeof page>) {
  res.json({data,...(total!==undefined?{pagination:{total,page:query!.page,limit:query!.limit,pages:Math.ceil(total/query!.limit)}}:{})});
}
export const one = <T>(value:T|null):T => { if (!value) throw new HttpError(404,'Record not found.'); return value; };
export function authenticate(db:PrismaClient,config:AppConfig) {
  return async (req:Request,_res:Response,next:NextFunction)=> {
    let payload:jwt.JwtPayload;
    try { const value = jwt.verify(req.cookies?.aeams_session || '',config.JWT_SECRET,{algorithms:['HS256'],issuer:'aeams',audience:'aeams-web'}); if (typeof value==='string') throw new Error(); payload=value; }
    catch { throw new HttpError(401,'Please sign in to continue.'); }
    if (typeof payload.sub!=='string' || !uuid.safeParse(payload.sub).success) throw new HttpError(401,'Session is invalid.');
    const user = await db.user.findUnique({where:{id:payload.sub},include:{roles:{include:{role:{include:{permissions:{include:{permission:true}}}}}}}});
    if (!user || !user.active || user.archived_at || user.auth_version!==payload.version || user.roles.length!==1 || !['ADMIN','EMPLOYEE'].includes(user.roles[0].role.code)) throw new HttpError(401,'Session has expired. Please sign in again.');
    req.actor={id:user.id,email:user.email,display_name:user.display_name,auth_version:user.auth_version,
      roles:user.roles.map(r=>r.role.code),permissions:[...new Set(user.roles.flatMap(r=>r.role.permissions.map(p=>p.permission.code)))]};
    next();
  };
}
export function borrowerId(req:Request,provided?:string) {
  if (!provided) throw new HttpError(422,'Select a verified farmer reference for this transaction.');
  return provided;
}
