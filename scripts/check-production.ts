import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { configSchema,validateDeploymentConfig } from '../backend/src/config.js';

try {
  const settings=parse(readFileSync('.env.production'));
  validateDeploymentConfig(configSchema.parse({...settings,NODE_ENV:'production'}));
  if(!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(settings.AEAMS_DOMAIN||''))throw new Error('AEAMS_DOMAIN must be a DNS hostname.');
  if(settings.FRONTEND_ORIGIN!==`https://${settings.AEAMS_DOMAIN}`)throw new Error('FRONTEND_ORIGIN must match AEAMS_DOMAIN over HTTPS.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.ACME_EMAIL||''))throw new Error('ACME_EMAIL is required.');
  if(settings.ALLOW_DEMO_SEED!=='false'||settings.DEMO_ADMIN_PASSWORD)throw new Error('Disable demonstration seeding and omit the demo password in production.');
  for(const name of ['POSTGRES_ADMIN_PASSWORD','AEAMS_MIGRATOR_PASSWORD','AEAMS_APP_PASSWORD','JWT_SECRET'])if(!/^[a-f0-9]{96}$/.test(settings[name]||''))throw new Error(`Generate ${name} with Initialize-Production.ps1.`);
  if(new Set(['POSTGRES_ADMIN_PASSWORD','AEAMS_MIGRATOR_PASSWORD','AEAMS_APP_PASSWORD','JWT_SECRET'].map(name=>settings[name])).size!==4)throw new Error('Deployment secrets must be distinct.');
  for(const [field,user,password] of [['DATABASE_URL','aeams_migrator','AEAMS_MIGRATOR_PASSWORD'],['APP_DATABASE_URL','aeams_app','AEAMS_APP_PASSWORD']]){
    const url=new URL(settings[field]);
    if(url.username!==user||decodeURIComponent(url.password)!==settings[password]||url.hostname!=='db'||url.pathname!==`/${settings.POSTGRES_DB}`||url.searchParams.get('schema')!=='aeams')throw new Error(`${field} does not match the deployment database settings.`);
  }
  console.log('Production environment checks passed. No secrets were printed.');
}catch(error){
  const message=error instanceof Error?error.message:'';
  console.error(message.startsWith('Production requires')||/^(AEAMS_DOMAIN|FRONTEND_ORIGIN|ACME_EMAIL|Disable|Generate|Deployment secrets|DATABASE_URL|APP_DATABASE_URL)/.test(message)?message:'Production configuration is missing or invalid. Run scripts/Initialize-Production.ps1; no secrets were printed.');
  process.exitCode=1;
}
