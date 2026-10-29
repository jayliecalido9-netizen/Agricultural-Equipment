import { parse } from 'dotenv';
import { readFile,writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';

async function connects(url:string){const client=new pg.Client({connectionString:url,connectionTimeoutMillis:3000});try{await client.connect();return true;}catch{return false;}finally{await client.end();}}
async function main(){
  let content=await readFile('.env','utf8');const settings=parse(content);
  const migration=new URL(settings.DATABASE_URL),application=new URL(settings.APP_DATABASE_URL);
  for(const url of [migration,application])if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/'+settings.POSTGRES_DB)throw new Error('This repair supports only the configured local Docker database.');
  if(!await connects(migration.toString())||!await connects(application.toString()))throw new Error('Existing URLs must authenticate before this recovery can preserve their credentials.');
  const migrationPassword=decodeURIComponent(migration.password),applicationPassword=decodeURIComponent(application.password);
  if(![migrationPassword,applicationPassword].every(v=>/^[A-Za-z0-9_-]{24,}$/.test(v)))throw new Error('Existing passwords require manual environment quoting; automatic repair stopped.');
  const updates:Record<string,string>={AEAMS_MIGRATOR_PASSWORD:migrationPassword,AEAMS_APP_PASSWORD:applicationPassword};
  const administrator=new URL(migration);administrator.username='postgres';administrator.password=settings.POSTGRES_ADMIN_PASSWORD;
  if(!await connects(administrator.toString())){
    const password=randomBytes(32).toString('hex');
    // Only the internal local DBA password changes. SQL goes through stdin, never argv/logs.
    await new Promise<void>((resolve,reject)=>{
      const child=spawn('docker',['compose','exec','-T','db','psql','-U','postgres','-d',settings.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q'],{stdio:['pipe','ignore','pipe']});
      child.stderr.resume();child.on('error',()=>reject(new Error('Local DBA connection failed.')));child.on('close',code=>code===0?resolve():reject(new Error('Local DBA credential recovery failed.')));
      child.stdin.end(`ALTER ROLE postgres PASSWORD '${password}';\n`);
    });updates.POSTGRES_ADMIN_PASSWORD=password;
  }
  for(const [key,value] of Object.entries(updates)){
    const line=new RegExp(`^${key}=.*$`,'m');content=line.test(content)?content.replace(line,`${key}=${value}`):content.trimEnd()+`\n${key}=${value}\n`;
  }
  await writeFile('.env',content,'utf8');
  console.log('Local database configuration reconciled. Existing AEAMS role credentials and application records were preserved. No passwords were printed.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Local configuration recovery failed.');process.exitCode=1;});
