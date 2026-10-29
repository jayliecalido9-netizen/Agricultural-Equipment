import 'dotenv/config';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { demoId } from '../backend/prisma/seed-data.js';

async function main(){
  const base=process.env.FRONTEND_ORIGIN||'http://localhost:3000';
  const db=new PrismaClient({datasources:{db:{url:process.env.APP_DATABASE_URL}}});
  const password=process.env.DEMO_ADMIN_PASSWORD;assert.ok(password);
  async function signIn(email:string){const response=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-AEAMS-Request':'1',Origin:base},body:JSON.stringify({email,password})});assert.equal(response.status,200);const cookie=response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);return cookie;}
  try{
    const roles=await db.role.findMany({orderBy:{code:'asc'}});assert.deepEqual(roles.map(r=>r.code),['ADMIN','EMPLOYEE']);
    const activeDemo=await db.user.findMany({where:{id:{in:[1,2,3,4].map(demoId)},active:true,archived_at:null}});assert.equal(activeDemo.length,2);
    const adminCookie=await signIn(process.env.DEMO_ADMIN_EMAIL||'admin@example.test'),employeeCookie=await signIn('employee@example.test');
    const get=(cookie:string,path:string)=>fetch(base+'/api/v1'+path,{headers:{Cookie:cookie}});
    const adminMe=await (await get(adminCookie,'/auth/me')).json() as {data:{roles:string[]}};assert.deepEqual(adminMe.data.roles,['ADMIN']);
    const employeeMe=await (await get(employeeCookie,'/auth/me')).json() as {data:{roles:string[]}};assert.deepEqual(employeeMe.data.roles,['EMPLOYEE']);
    const lookups=await (await get(adminCookie,'/lookups')).json() as {data:{roles:{code:string}[]}};assert.deepEqual(lookups.data.roles.map(r=>r.code).sort(),['ADMIN','EMPLOYEE']);
    for(const path of ['/users','/integrations','/audit-logs'])assert.equal((await get(employeeCookie,path)).status,403);
    for(const path of ['/dashboard','/equipment','/borrowings','/maintenance','/reports/inventory','/farmers'])assert.equal((await get(employeeCookie,path)).status,200);
    const approval=await fetch(base+`/api/v1/reservations/${demoId(200)}/approve`,{method:'POST',headers:{Cookie:employeeCookie,'X-AEAMS-Request':'1',Origin:base,'Content-Type':'application/json'},body:'{}'});assert.equal(approval.status,403);
    const browser=await chromium.launch({channel:'msedge',headless:true});
    try{
      for(const [email,admin] of [[process.env.DEMO_ADMIN_EMAIL||'admin@example.test',true],['employee@example.test',false]] as const){
        const context=await browser.newContext();const page=await context.newPage();
        await page.goto(base+'/login');await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in to workspace'}).click();await page.waitForURL(base+'/');await page.locator('main h1').waitFor();
        assert.equal(await page.getByRole('link',{name:'Users & roles',exact:true}).count(),admin?1:0);
        if(admin){await page.goto(base+'/users');await page.getByRole('button',{name:'Add user',exact:true}).click();const role=page.getByRole('dialog').getByLabel('Access role');const options=await role.locator('option').allTextContents();assert.deepEqual(options.slice(1),['Admin','Employee']);}
        else{await page.goto(base+'/reservations');await page.locator('main h1').waitFor();assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).count(),0);}
        await context.close();
      }
    }finally{await browser.close();}
    console.log('Verified exactly two roles, two active demo logins, Admin-only controls, Employee workflows, and the two-role selector.');
  }finally{await db.$disconnect();}
}
main().catch(()=>{console.error('Two-role verification failed. Check migration state and current demo credentials.');process.exitCode=1;});
