import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { z } from 'zod';
async function main(){
  const input=z.object({ADMIN_EMAIL:z.string().email().max(254).transform(v=>v.toLowerCase().trim()),ADMIN_PASSWORD:z.string().min(16).max(128),ADMIN_NAME:z.string().min(1).max(150).default('Admin')}).safeParse(process.env);
  if(!input.success)throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 16 characters); ADMIN_NAME is optional.');
  const db=new PrismaClient();try{
    const role=await db.role.findUnique({where:{code:'ADMIN'}});if(!role)throw new Error('Run db:bootstrap first.');
    if(await db.user.findUnique({where:{email:input.data.ADMIN_EMAIL}}))throw new Error('This email already exists. This command does not overwrite accounts.');
    await db.user.create({data:{email:input.data.ADMIN_EMAIL,display_name:input.data.ADMIN_NAME,password_hash:await hash(input.data.ADMIN_PASSWORD,12),roles:{create:{role_id:role.id}}}});
    console.log('Administrator account created. No credentials were printed.');
  }finally{await db.$disconnect();}
}
main().catch(error=>{console.error(error instanceof Error&&['Set ADMIN','Run db:','This email'].some(p=>error.message.startsWith(p))?error.message:'Account creation failed. Verify database connectivity and migrations.');process.exitCode=1;});
