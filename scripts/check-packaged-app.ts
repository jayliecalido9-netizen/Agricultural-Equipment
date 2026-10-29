import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

async function main(){
 const base=process.env.FRONTEND_ORIGIN||'http://localhost:3000';
 assert.ok(process.env.DEMO_ADMIN_PASSWORD,'Demo account is required for this local verification.');
 const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-AEAMS-Request':'1',Origin:base},body:JSON.stringify({email:process.env.DEMO_ADMIN_EMAIL||'admin@example.test',password:process.env.DEMO_ADMIN_PASSWORD})});
 assert.equal(login.status,200,'Packaged login through Nginx must succeed.');const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
 const headers={Cookie:cookie,'X-AEAMS-Request':'1',Origin:base};
 const catalog=await fetch(base+'/api/v1/equipment?archived=true&search=Fictional%20browser%20verification', {headers});assert.ok(catalog.ok);
 const body=await catalog.json() as {data:{id:string;archived_at:string|null}[]};const asset=body.data.find(a=>a.archived_at);assert.ok(asset,'Run the full browser verification once to create its archived fictional QA asset.');
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 const form=new FormData();form.append('image',new Blob([bytes],{type:'image/png'}),'fictional-qa.png');
 const upload=await fetch(base+`/api/v1/equipment/${asset.id}/images`,{method:'POST',headers,body:form});assert.equal(upload.status,201,'Docker upload volume must be writable by the API service.');
 const image=(await upload.json() as {data:{id:string}}).data;
 const before=await fetch(base+`/api/v1/images/${image.id}`,{headers});assert.ok(before.ok);assert.deepEqual(Buffer.from(await before.arrayBuffer()),bytes);
 await promisify(execFile)('docker',['compose','restart','backend'],{timeout:60000});
 let healthy=false;for(let attempt=0;attempt<30;attempt++){try{const health=await fetch(base+'/api/v1/health');if(health.ok){healthy=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,1000));}assert.ok(healthy,'API must recover after restart.');
 const after=await fetch(base+`/api/v1/images/${image.id}`,{headers});assert.ok(after.ok);assert.deepEqual(Buffer.from(await after.arrayBuffer()),bytes);
 console.log('Packaged login, Nginx API proxy, authenticated image upload, and photo persistence across API restart verified.');
}
main().catch(()=>{console.error('Packaged application verification failed. Check Docker service health and install the fictional browser QA fixture first. No credentials were printed.');process.exitCode=1;});
