import { spawn } from 'node:child_process';
import { createWriteStream,createReadStream } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createHash,randomUUID } from 'node:crypto';
import path from 'node:path';

export const composeArgs=(production:boolean)=>production?['compose','-p','aeams-production','--env-file','.env.production','-f','docker-compose.yml','-f','docker-compose.production.yml']:['compose'];
export async function docker(args:string[],inputFile?:string,outputFile?:string):Promise<string>{
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});
  // Drain diagnostics without displaying potentially sensitive connection details.
  child.stderr.resume();
  const ended=new Promise<void>((resolve,reject)=>{child.once('error',()=>reject(new Error('Docker could not start.')));child.once('close',code=>code===0?resolve():reject(new Error('Docker backup operation failed. Inspect container health.')));});
  let text='';
  if(!outputFile)child.stdout.on('data',chunk=>{text+=chunk.toString();});
  const work:Promise<unknown>[]=[ended];
  if(outputFile)work.push(pipeline(child.stdout,createWriteStream(outputFile,{flags:'wx',mode:0o600})));
  if(inputFile)work.push(pipeline(createReadStream(inputFile),child.stdin));else child.stdin.end();
  await Promise.all(work);
  return text.trim();
}
export async function checksum(file:string){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}

async function main(){
  const production=process.argv.includes('--production'),compose=composeArgs(production);
  const running=await docker([...compose,'ps','--status','running','--services']);
  if(!running.split(/\r?\n/).includes('backend'))throw new Error('Start the application before taking a coordinated backup.');
  const directory=path.resolve('backups',`aeams-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`);
  await mkdir(directory,{recursive:true});
  let paused=false;
  try{
    console.log('Briefly pausing the API to capture matching database records and uploaded photos.');
    paused=true;await docker([...compose,'stop','backend']);
    await docker([...compose,'exec','-T','db','sh','-c','pg_dump -U postgres -d "$POSTGRES_DB" --format=custom'],undefined,path.join(directory,'database.dump'));
    await docker([...compose,'run','--rm','--no-deps','-T','--entrypoint','tar','backend','-czf','-','-C','/app/uploads','.'],undefined,path.join(directory,'uploads.tar.gz'));
    const files={
      'database.dump':await checksum(path.join(directory,'database.dump')),
      'uploads.tar.gz':await checksum(path.join(directory,'uploads.tar.gz'))
    };
    await writeFile(path.join(directory,'manifest.json'),JSON.stringify({format:1,created_at:new Date().toISOString(),production,files},null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(`Complete backup: ${directory}`);
  }finally{if(paused)await docker([...compose,'start','backend']);}
}
// Shared binary-safe Docker helpers are also imported by the restore drill.
if(process.argv[1]?.replaceAll('\\','/').endsWith('/backup-application.ts'))main().catch(error=>{console.error(error instanceof Error?error.message:'Backup failed.');process.exitCode=1;});
