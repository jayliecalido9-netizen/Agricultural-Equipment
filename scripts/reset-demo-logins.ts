import 'dotenv/config';
import { parse } from 'dotenv';
import { readFile,writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { demoId } from '../backend/prisma/seed-data.js';
import { withActor } from '../backend/src/database.js';

async function main(){
  if(process.env.ALLOW_DEMO_PASSWORD_RESET!=='true'||process.env.NODE_ENV==='production')throw new Error('This command requires explicit local development password-reset opt-in.');
  let content=await readFile('.env','utf8');const settings=parse(content);const url=new URL(settings.DATABASE_URL);
  if(!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Only the local demonstration database is supported.');
  const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
  try{
    const users=await db.user.findMany({where:{id:{in:[1,2].map(demoId)},active:true,archived_at:null}});
    const fictional=users.filter(u=>u.display_name.startsWith('Fictional ')&&(u.email.endsWith('@example.test')||(u.id===demoId(1)&&u.email===settings.DEMO_ADMIN_EMAIL)));
    const admin=fictional.find(u=>u.id===demoId(1));if(!admin)throw new Error('The known fictional demo administrator was not found. No accounts were changed.');
    const candidate=settings.DEMO_ADMIN_PASSWORD||'';
    const password=candidate.length>=8&&candidate.length<=128&&!/[\r\n]/.test(candidate)?candidate:randomBytes(24).toString('hex');
    const password_hash=await hash(password,12);
    await withActor(db,admin.id,'local-demo-login-recovery',tx=>tx.user.updateMany({where:{id:{in:fictional.map(u=>u.id)}},data:{password_hash,auth_version:{increment:1}}}));
    if(password!==candidate)content=content.replace(/^DEMO_ADMIN_PASSWORD=.*$/m,`DEMO_ADMIN_PASSWORD=${password}`);
    content=content.replace(/^DEMO_ADMIN_EMAIL=.*$/m,`DEMO_ADMIN_EMAIL=${admin.email}`);
    await writeFile('.env',content,'utf8');
    console.log(`Synchronized ${fictional.length} fictional development accounts. Use DEMO_ADMIN_PASSWORD from .env. No passwords were printed.`);
  }finally{await db.$disconnect();}
}
main().catch(()=>{console.error('Demo login recovery failed. Verify explicit development opt-in and the known fictional demo accounts.');process.exitCode=1;});
