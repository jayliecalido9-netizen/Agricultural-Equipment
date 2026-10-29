import 'dotenv/config';
import { chromium } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { demoId } from '../backend/prisma/seed-data.js';

async function main(){
  if(!process.env.DEMO_ADMIN_PASSWORD)throw new Error('Seed demonstration accounts before browser verification.');
  const browser=await chromium.launch({...(process.platform==='win32'?{channel:'msedge'}:{}),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const base=process.env.BROWSER_BASE_URL||process.env.FRONTEND_ORIGIN||'http://localhost:3000';
  const ready=async()=>{await page.locator('main h1').waitFor();await page.locator('.loading-state').waitFor({state:'hidden'});};
  await mkdir('test-results',{recursive:true});
  try{
    await page.goto(base+'/login');await page.getByLabel('Email address').waitFor();await page.screenshot({path:'test-results/login.png',fullPage:true});await page.getByLabel('Email address').fill(process.env.DEMO_ADMIN_EMAIL||'admin@example.test');await page.getByLabel('Password',{exact:true}).fill(process.env.DEMO_ADMIN_PASSWORD);await page.getByRole('button',{name:'Sign in to workspace'}).click();
    await page.waitForURL(base+'/');await ready();await page.screenshot({path:'test-results/dashboard.png',fullPage:true});
    if (!process.argv.includes('--screenshots-only')) {
    const assetCode='QA-'+randomUUID().slice(0,8).toUpperCase();
    await page.getByRole('link',{name:'Add equipment',exact:true}).click();await page.getByRole('heading',{name:'Register equipment'}).waitFor();
    await page.getByLabel('Asset code').fill(assetCode);await page.getByLabel('Equipment name').fill('Fictional browser verification tractor');await page.getByLabel('Category',{exact:false}).selectOption(demoId(11));await page.getByLabel('Assigned location').selectOption(demoId(10));
    await page.getByRole('button',{name:'Register equipment',exact:true}).click();await page.waitForURL(/\/equipment\/[a-f0-9-]{36}$/);await ready();const assetPath=new URL(page.url()).pathname;
    await page.getByRole('link',{name:'Edit equipment'}).click();await page.getByLabel('Description').fill('Fictional asset used to verify the browser form.');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForURL(base+assetPath);
    await page.goto(base+'/reservations');await ready();await page.getByRole('button',{name:'Create reservation'}).click();const dialog=page.getByRole('dialog');
    const lookups=await context.request.get(base+'/api/v1/lookups');const data=(await lookups.json()).data;const gear=data.equipment.find((e:{asset_code:string})=>e.asset_code===assetCode);if(!gear)throw new Error('Created equipment is absent from form lookups.');
    await dialog.getByLabel('Equipment',{exact:false}).selectOption(gear.id);await dialog.getByLabel('Verified farmer reference').selectOption(demoId(20));await dialog.getByLabel('Usage location').fill('Fictional QA farm');await dialog.getByLabel('Purpose of use').fill('Browser workflow verification');await dialog.getByRole('button',{name:'Submit reservation'}).click();await dialog.waitFor({state:'hidden'});
    let row=page.getByRole('row').filter({hasText:'Fictional browser verification tractor'}).first();await row.getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await row.getByText('Approved',{exact:true}).waitFor();
    await row.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).last().click();await page.getByRole('dialog').waitFor({state:'hidden'});await row.getByText('Cancelled',{exact:true}).waitFor();
    await page.goto(base+'/borrowings');await ready();await page.getByRole('button',{name:'Create borrowing request'}).click();
    await page.getByRole('dialog').getByLabel('Equipment',{exact:false}).selectOption(gear.id);await page.getByRole('dialog').getByLabel('Verified farmer reference').selectOption(demoId(20));await page.getByRole('dialog').getByLabel('Purpose of use').fill('Fictional browser borrowing and immediate return verification');await page.getByRole('dialog').getByRole('button',{name:'Submit borrowing request'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    row=page.getByRole('row').filter({hasText:'Fictional browser verification tractor'}).first();await row.getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await row.getByRole('button',{name:'Release',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Release',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.goto(base+'/returns');await ready();row=page.getByRole('row').filter({hasText:'Fictional browser verification tractor'}).first();await row.getByRole('button',{name:'Record return',exact:true}).click();await page.getByRole('dialog').getByLabel('Actual operating hours').fill('0.5');await page.getByRole('dialog').getByRole('button',{name:'Confirm inspected return'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.goto(base+assetPath);await ready();await page.getByRole('button',{name:'Archive',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
    }
    for(const route of ['/equipment','/availability','/utilization','/reservations','/reservation-calendar','/borrowings','/returns','/maintenance','/maintenance-calendar','/farmers','/reports','/notifications','/users','/integrations','/audit','/settings']){
      await page.goto(base+route);await ready();if(await page.locator('.error-panel').count())throw new Error(`Page failed: ${route} · ${await page.locator('.error-panel').innerText()}`);console.log(`Browser verified ${route}`);
    }
    await page.goto(base+'/equipment');await ready();await page.screenshot({path:'test-results/equipment.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await page.goto(base+'/');await ready();await page.screenshot({path:'test-results/mobile.png',fullPage:true});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);if(overflow)throw new Error('Mobile dashboard overflows the viewport.');
    await page.getByRole('button',{name:'Open navigation'}).click();await page.getByRole('link',{name:'Equipment inventory',exact:true}).click();await page.getByRole('heading',{name:'Equipment inventory'}).waitFor();
    if(errors.length)throw new Error(`Browser script errors: ${errors.join('; ')}`);console.log(process.argv.includes('--screenshots-only')?'Packaged pages, updated charts, and mobile navigation verified.':'Browser checks passed: login, equipment create/edit/archive, reservation approve/cancel, borrowing approve/release/return, all pages, and mobile navigation.');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Browser verification failed.');process.exitCode=1;});
