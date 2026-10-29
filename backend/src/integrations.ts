import type { IntegrationConnection } from '@prisma/client';
import { HttpError } from './http.js';

export const modules=['FFRMS','APMS','AISMS','AASMS','ABPMS'] as const;
export function connectionStatus(c:IntegrationConnection) {
  if (c.mode==='DISABLED') return 'Disabled';
  if (c.mode==='MOCK') return 'Mock';
  if (c.last_error_code) return 'Error';
  return c.verified_at && Date.now()-c.verified_at.getTime()<300000?'Connected':'Unverified';
}
export async function verifyConnection(c:IntegrationConnection) {
  if (c.mode==='MOCK') return {status:'Mock',verified:false,message:'Development adapter only; no external service was contacted.'};
  if (c.mode==='DISABLED') throw new HttpError(422,'Enable a mock or live configuration before testing.');
  const url=new URL(c.base_url!);
  const allowed=(process.env.INTEGRATION_ALLOWED_HOSTS||'').split(',').map(v=>v.trim()).filter(Boolean);
  if (url.protocol!=='https:' || url.username || url.password || !allowed.includes(url.hostname)) throw new HttpError(422,'The server administrator must explicitly allow this HTTPS host in INTEGRATION_ALLOWED_HOSTS.');
  const token=process.env[`${c.module}_API_TOKEN`];
  if (!token) throw new HttpError(422,`Configure ${c.module}_API_TOKEN on the backend first.`);
  let lastError='HEALTH_CHECK_FAILED';
  for (let attempt=0;attempt<=c.max_retries;attempt++) {
    try {
      const health=new URL(url.toString().replace(/\/$/,'')+'/health');
      const response=await fetch(health,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(c.timeout_ms),redirect:'error'});
      if (!response.ok) { lastError=`HTTP_${response.status}`; if (response.status<500) break; continue; }
      const body=await response.json() as {module?:string;status?:string};
      if (body.module!==c.module || !['ok','healthy'].includes(body.status||'')) { lastError='UNVERIFIED_MODULE_IDENTITY'; break; }
      return {status:'Connected',verified:true,message:'Authenticated health and module identity verified.'};
    } catch { lastError='NETWORK_OR_TIMEOUT'; }
    if (attempt<c.max_retries) await new Promise(resolve=>setTimeout(resolve,Math.min(250*2**attempt,2000)));
  }
  throw new HttpError(502,`Connection failed: ${lastError}.`);
}

// Proposed outbound contracts; other teams' paths must be confirmed before enabling delivery.
export const integrationContracts={
  FFRMS:{owns:'Farmer identity and farm registration',operations:['farmer.lookup','farmer.verify']},
  APMS:{owns:'Agricultural production records',operations:['aeams.utilization.recorded.v1']},
  AISMS:{owns:'Consumables, spare parts and stock issuance',operations:['maintenance.material.requested.v1']},
  AASMS:{owns:'Assistance eligibility and approvals',operations:['assistance.reference.verify']},
  ABPMS:{owns:'Procurement, budgets and financial approvals',operations:['repair.funding.requested.v1']}
};
