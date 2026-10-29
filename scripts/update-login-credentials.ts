import 'dotenv/config';
import { parse } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { withActor } from '../backend/src/database.js';

async function main(){
  if(process.env.ALLOW_LOGIN_CREDENTIAL_UPDATE!=='true'||process.env.NODE_ENV==='production')throw new Error('Explicit local development opt-in is required.');
  const settings=parse(await readFile('.env','utf8'));
  const input=z.object({DEMO_ADMIN_EMAIL:z.string().email(),DEMO_ADMIN_PASSWORD:z.string().min(8).max(128)}).parse(settings);
  const url=new URL(settings.DATABASE_URL);if(!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Only the configured local database is supported.');
  const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
  try{
    const admins=await db.user.findMany({where:{active:true,archived_at:null,roles:{some:{role:{code:'ADMIN'}}}}});
    if(admins.length!==1)throw new Error('Expected one active Admin account.');
    const email=input.DEMO_ADMIN_EMAIL.toLowerCase().trim();
    const existing=await db.user.findUnique({where:{email}});if(existing&&existing.id!==admins[0].id)throw new Error('This email is assigned to another account.');
    const password_hash=await hash(input.DEMO_ADMIN_PASSWORD,12);
    await withActor(db,admins[0].id,'requested-login-credential-update',async tx=>{
      await tx.user.updateMany({where:{roles:{some:{role:{code:{in:['ADMIN','EMPLOYEE']}}}}},data:{password_hash,auth_version:{increment:1}}});
      await tx.user.update({where:{id:admins[0].id},data:{email}});
    });
    console.log('Admin email and application account passwords updated. Existing sessions were revoked. No passwords were printed.');
  }finally{await db.$disconnect();}
}
main().catch(()=>{console.error('Login credential update failed. Check the local configuration and unique Admin account.');process.exitCode=1;});
