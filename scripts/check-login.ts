import 'dotenv/config';
async function main(){
  const base=process.env.FRONTEND_ORIGIN||'http://localhost:3000';
  const health=await fetch(base+'/api/v1/health',{signal:AbortSignal.timeout(5000)});
  if(!health.ok)throw new Error(`Frontend-to-API health check failed (${health.status}).`);
  const response=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-AEAMS-Request':'1',Origin:base},body:JSON.stringify({email:process.env.DEMO_ADMIN_EMAIL||'admin@example.test',password:process.env.DEMO_ADMIN_PASSWORD}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(response.status===401?'API connection is healthy, but the configured demo password does not match the existing account.':`Login check failed (${response.status}).`);
  const cookie=response.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('Login did not set a session cookie.');
  const me=await fetch(base+'/api/v1/auth/me',{headers:{Cookie:cookie},signal:AbortSignal.timeout(5000)});
  if(!me.ok)throw new Error('Session verification failed.');
  console.log('Frontend-to-API connection, configured demo login, and authenticated session verified. No passwords were printed.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Login verification failed.');process.exitCode=1;});
