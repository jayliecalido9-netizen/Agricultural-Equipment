import 'dotenv/config';
import pg from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
async function main(){
  for(const [name,urlKey,passwordKey] of [['migration','DATABASE_URL','AEAMS_MIGRATOR_PASSWORD'],['application','APP_DATABASE_URL','AEAMS_APP_PASSWORD']] as const){
    let matches=false;try{matches=decodeURIComponent(new URL(process.env[urlKey]||'').password)===process.env[passwordKey];}catch{}
    console.log(`${name} URL matches configured password: ${matches}`);
    const url=new URL(process.env[urlKey]||'');
    if(!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Local diagnosis only.');
    const client=new pg.Client({connectionString:url.toString(),connectionTimeoutMillis:3000});
    try{await client.connect();console.log(`${name} URL authentication: OK`);}catch(error){console.log(`${name} URL authentication: FAILED (${(error as {code?:string}).code||'CONNECTION'})`);}finally{await client.end();}
  }
  for(const [user,key] of [['postgres','POSTGRES_ADMIN_PASSWORD'],['aeams_migrator','AEAMS_MIGRATOR_PASSWORD'],['aeams_app','AEAMS_APP_PASSWORD']] as const){
    const client=new pg.Client({host:'127.0.0.1',port:Number(process.env.POSTGRES_PORT||5432),database:process.env.POSTGRES_DB||'agriconnect',user,password:process.env[key],connectionTimeoutMillis:3000});
    try{await client.connect();console.log(`${user} authentication: OK`);}catch(error){console.log(`${user} authentication: FAILED (${(error as {code?:string}).code||'CONNECTION'})`);}finally{await client.end();}
  }
  const result=await promisify(execFile)('docker',['compose','exec','-T','db','psql','-U','postgres','-d',process.env.POSTGRES_DB||'agriconnect','-At','-c',"SELECT 'equipment_records='||count(*) FROM aeams.equipment; SELECT 'migration_records='||count(*) FROM aeams._prisma_migrations;"]);
  console.log(result.stdout.trim());
}
main().catch(()=>{console.error('Connection diagnosis failed. No credentials were printed.');process.exitCode=1;});
