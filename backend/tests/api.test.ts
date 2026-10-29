import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app.js';
import { configSchema } from '../src/config.js';
import { demoId,seedDemoData,seedReferenceData,ensureDemoAccounts } from '../prisma/seed-data.js';
import { generateReminders } from '../src/notifications.js';

test('AEAMS API against isolated PostgreSQL with restricted runtime credentials',{timeout:180000},async suite=>{
  if (!process.env.POSTGRES_ADMIN_PASSWORD||!process.env.APP_DATABASE_URL) throw new Error('Local PostgreSQL configuration is required for API tests. Start docker compose up -d --wait db first.');
  const databaseName=`aeams_test_${randomUUID().replaceAll('-','')}`;assert.match(databaseName,/^aeams_test_[a-f0-9]{32}$/);
  const serverUrl=new URL(process.env.APP_DATABASE_URL);serverUrl.username='postgres';serverUrl.password=process.env.POSTGRES_ADMIN_PASSWORD;
  const admin=new pg.Client({connectionString:serverUrl.toString()});await admin.connect();let db:PrismaClient|undefined,fixture:pg.Client|undefined;
  const uploads=path.resolve('.test-data',`uploads-${randomUUID()}`),password='DevelopmentApiTestPassword!';
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);const migrationUrl=new URL(serverUrl);migrationUrl.pathname=`/${databaseName}`;
    fixture=new pg.Client({connectionString:migrationUrl.toString()});await fixture.connect();await fixture.query('CREATE SCHEMA aeams');
    await promisify(execFile)(process.execPath,[path.resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','backend/prisma/schema.prisma'],{env:{...process.env,DATABASE_URL:migrationUrl.toString()},timeout:60000});
    await fixture.query('BEGIN');await seedReferenceData(fixture);await seedDemoData(fixture,'admin@example.test',password);await ensureDemoAccounts(fixture,password);await fixture.query('COMMIT');
    const runtimeUrl=new URL(process.env.APP_DATABASE_URL);runtimeUrl.pathname=`/${databaseName}`;
    db=new PrismaClient({datasources:{db:{url:runtimeUrl.toString()}}});const runtime=db;
    const app=createApp(runtime,configSchema.parse({JWT_SECRET:'test-only-secret-'.repeat(6),NODE_ENV:'test',UPLOAD_DIRECTORY:uploads}));
    const adminAgent=request.agent(app),employeeAgent=request.agent(app);
    const post=(agent:typeof adminAgent,url:string,body:object={})=>agent.post('/api/v1'+url).set('X-AEAMS-Request','1').send(body);
    let equipmentId='',reservationId='',loanId='',workId='';
    const from=new Date(Date.now()-60000).toISOString(),to=new Date(Date.now()+86400000).toISOString();
    await suite.test('health, authentication errors and CSRF protection',async()=>{
      await request(app).get('/api/v1/health').expect(200);await request(app).get('/api/v1/equipment').expect(401);
      await request(app).post('/api/v1/auth/login').send({email:'admin@example.test',password}).expect(403);
      await post(adminAgent,'/auth/login',{email:'admin@example.test',password:'incorrect'}).expect(401);
      await post(adminAgent,'/auth/login',{email:'admin@example.test',password}).expect(200);
      await post(employeeAgent,'/auth/login',{email:'employee@example.test',password}).expect(200);
      await post(request.agent(app),'/auth/login',{email:'borrower@example.test',password}).expect(401);
      await post(request.agent(app),'/auth/login',{email:'officer@example.test',password}).expect(401);
    });
    await suite.test('user responses never expose password hashes',async()=>{
      const r=await adminAgent.get('/api/v1/users').expect(200);assert.ok(!JSON.stringify(r.body).includes('password_hash'));
      const me=await employeeAgent.get('/api/v1/auth/me').expect(200);assert.deepEqual(me.body.data.roles,['EMPLOYEE']);
      const lookups=await adminAgent.get('/api/v1/lookups').expect(200);assert.deepEqual(lookups.body.data.roles.map((r:{code:string})=>r.code).sort(),['ADMIN','EMPLOYEE']);
    });
    await suite.test('production sign-in issues a secure HTTP-only session cookie',async()=>{
      const secureApp=createApp(runtime,configSchema.parse({JWT_SECRET:randomUUID().repeat(3),NODE_ENV:'production',FRONTEND_ORIGIN:'https://equipment.example.org',COOKIE_SECURE:'true',TRUST_PROXY_HOPS:2,UPLOAD_DIRECTORY:uploads}));
      const response=await request(secureApp).post('/api/v1/auth/login').set('X-AEAMS-Request','1').set('Origin','https://equipment.example.org').set('X-Forwarded-For','198.51.100.25, 172.18.0.3').send({email:'admin@example.test',password}).expect(200);
      const cookie=String(response.headers['set-cookie']);
      for(const attribute of ['HttpOnly','Secure','SameSite=Strict','Path=/api'])assert.ok(cookie.includes(attribute));
      assert.equal(response.headers['cache-control'],'no-store');
    });
    await suite.test('employee cannot bypass approvals, administration or protected fields',async()=>{
      await employeeAgent.get('/api/v1/users').expect(403);await employeeAgent.get('/api/v1/reports/inventory').expect(200);
      await post(employeeAgent,'/users',{display_name:'Forbidden'}).expect(403);
      await employeeAgent.patch('/api/v1/settings').set('X-AEAMS-Request','1').send({name:'Unauthorized change'}).expect(403);
      await employeeAgent.get('/api/v1/audit-logs').expect(403);
      await post(employeeAgent,`/reservations/${demoId(200)}/approve`).expect(403);
      const result=await post(employeeAgent,'/reservations',{equipment_id:demoId(107),starts_at:new Date(Date.now()+86400000).toISOString(),ends_at:new Date(Date.now()+2*86400000).toISOString(),purpose:'Test',usage_location:'Fictional',approved_by:demoId(1)}).expect(422);
      assert.ok(result.body.error);
    });
    await suite.test('administrator can register, edit, search and filter equipment',async()=>{
      const r=await post(adminAgent,'/equipment',{asset_code:'API-TEST-001',name:'API test tractor',category_id:demoId(11),location_id:demoId(10),condition:'GOOD'}).expect(201);equipmentId=r.body.data.id;
      await adminAgent.patch(`/api/v1/equipment/${equipmentId}`).set('X-AEAMS-Request','1').send({brand:'Test brand'}).expect(200);
      const list=await adminAgent.get('/api/v1/equipment?search=API-TEST&status=AVAILABLE').expect(200);assert.equal(list.body.data.length,1);
      const detail=await adminAgent.get(`/api/v1/equipment/${equipmentId}`).expect(200);assert.equal(detail.body.data.brand,'Test brand');
    });
    await suite.test('equipment images are validated and served through authentication',async()=>{
      await adminAgent.post(`/api/v1/equipment/${equipmentId}/images`).set('X-AEAMS-Request','1').field('unexpected','value').expect(422);
      await adminAgent.post(`/api/v1/equipment/${equipmentId}/images`).set('X-AEAMS-Request','1').attach('image',Buffer.alloc(5*1024*1024+1),'oversized.png').expect(422);
      await adminAgent.post(`/api/v1/equipment/${equipmentId}/images`).set('X-AEAMS-Request','1').attach('image',Buffer.from('<svg onload="alert(1)"/>'),'unsafe.svg').expect(422);
      const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
      const r=await adminAgent.post(`/api/v1/equipment/${equipmentId}/images`).set('X-AEAMS-Request','1').attach('image',png,'tractor.png').expect(201);
      await request(app).get(`/api/v1/images/${r.body.data.id}`).expect(401);await adminAgent.get(`/api/v1/images/${r.body.data.id}`).expect(200).expect('Content-Type',/image\/png/);
    });
    await suite.test('reservation creation, approval and actual conflict response',async()=>{
      const body={equipment_id:equipmentId,farmer_id:demoId(20),starts_at:new Date(Date.now()+2*86400000).toISOString(),ends_at:new Date(Date.now()+3*86400000).toISOString(),purpose:'API test planting',usage_location:'Fictional test farm'};
      const first=await post(adminAgent,'/reservations',body).expect(201);reservationId=first.body.data.id;
      await post(adminAgent,`/reservations/${reservationId}/approve`).expect(200);
      const second=await post(adminAgent,'/reservations',body).expect(201);
      await post(adminAgent,`/reservations/${second.body.data.id}/approve`).expect(409);
      await post(adminAgent,`/reservations/${second.body.data.id}/reject`,{reason:'Conflicting approved schedule'}).expect(200);
      await post(adminAgent,`/reservations/${reservationId}/cancel`).expect(200);
    });
    await suite.test('borrowing approval, release and duplicate prevention',async()=>{
      const body={equipment_id:equipmentId,farmer_id:demoId(20),starts_at:from,expected_return_at:to,purpose:'API test tillage'};
      const created=await post(adminAgent,'/borrowings',body).expect(201);loanId=created.body.data.id;
      await post(adminAgent,`/borrowings/${loanId}/approve`).expect(200);
      await post(employeeAgent,`/borrowings/${loanId}/release`,{condition:'GOOD'}).expect(200);
      const second=await post(adminAgent,'/borrowings',body).expect(201);await post(adminAgent,`/borrowings/${second.body.data.id}/approve`).expect(409);
      await post(adminAgent,`/borrowings/${second.body.data.id}/reject`,{reason:'Equipment already on loan'}).expect(200);
      const e=await adminAgent.get(`/api/v1/equipment/${equipmentId}`).expect(200);assert.equal(e.body.data.availability,'BORROWED');
    });
    await suite.test('damaged return requires inspection and remains unavailable',async()=>{
      await post(adminAgent,`/borrowings/${loanId}/return`,{returned_at:new Date().toISOString(),condition:'DAMAGED'}).expect(422);
      await post(employeeAgent,`/borrowings/${loanId}/return`,{returned_at:new Date().toISOString(),condition:'DAMAGED',damage_description:'Fictional broken guard',operating_hours:1.25,area_hectares:.5}).expect(200);
      const e=await adminAgent.get(`/api/v1/equipment/${equipmentId}`).expect(200);assert.equal(e.body.data.availability,'UNAVAILABLE');
      const usage=await runtime.integrationOutbox.findFirst({where:{idempotency_key:{startsWith:'usage:'}}});assert.ok(usage);
      await adminAgent.get(`/api/v1/borrowings/${loanId}/receipt?type=return`).expect(200).expect('Content-Type',/application\/pdf/);
    });
    await suite.test('maintenance is assigned, processed, recorded and returns usable equipment',async()=>{
      const r=await post(adminAgent,'/maintenance',{equipment_id:equipmentId,type:'CORRECTIVE',description:'Replace fictional guard',assigned_to:demoId(2),starts_at:from,ends_at:to,estimated_cost:100}).expect(201);workId=r.body.data.id;
      await post(employeeAgent,`/maintenance/${workId}/start`).expect(200);
      await post(employeeAgent,`/maintenance/${workId}/complete`,{repair_notes:'Replaced and inspected guard',actual_cost:95,condition:'GOOD'}).expect(200);
      const e=await adminAgent.get(`/api/v1/equipment/${equipmentId}`).expect(200);assert.equal(e.body.data.availability,'AVAILABLE');
      const assigned=await employeeAgent.get('/api/v1/maintenance').expect(200);assert.ok(assigned.body.data.every((r:{assigned_to:string})=>r.assigned_to===demoId(2)));
    });
    await suite.test('employee handles operations but approvals remain admin-only',async()=>{
      const r=await post(employeeAgent,'/borrowings',{equipment_id:equipmentId,starts_at:from,expected_return_at:to,purpose:'Employee request for a verified farmer',farmer_id:demoId(20)}).expect(201);
      await post(employeeAgent,`/borrowings/${r.body.data.id}/approve`).expect(403);
      await post(employeeAgent,`/borrowings/${r.body.data.id}/cancel`).expect(200);
      await employeeAgent.get('/api/v1/borrowings').expect(200);await employeeAgent.get('/api/v1/dashboard').expect(200);
      const dashboard=await employeeAgent.get('/api/v1/dashboard').expect(200);assert.ok(dashboard.body.data.summary.total_equipment);assert.equal(dashboard.body.data.personal,undefined);
    });
    await suite.test('reports, exports, calendar, dashboard and utilization return actual data',async()=>{
      for(const resource of ['inventory','availability','conditions','borrowings','returns','overdue','maintenance','utilization']) await adminAgent.get(`/api/v1/reports/${resource}`).expect(200);
      await adminAgent.get('/api/v1/reports/inventory?format=csv').expect(200).expect('Content-Type',/text\/csv/);
      await adminAgent.get('/api/v1/reports/inventory?format=pdf').expect(200).expect('Content-Type',/application\/pdf/);
      const dashboard=await adminAgent.get('/api/v1/dashboard').expect(200);assert.equal(Number(dashboard.body.data.summary.total_equipment),10);
      await adminAgent.get(`/api/v1/calendar?starts_at=${encodeURIComponent(from)}&ends_at=${encodeURIComponent(to)}`).expect(200);
      await adminAgent.get('/api/v1/utilization').expect(200);
    });
    await suite.test('reminders are deduplicated and notifications are personal',async()=>{
      await generateReminders(runtime);const before=await runtime.notification.count();await generateReminders(runtime);assert.equal(await runtime.notification.count(),before);
      const n=await employeeAgent.get('/api/v1/notifications').expect(200);assert.ok(n.body.data.every((r:{user_id:string})=>r.user_id===demoId(2)));
      const adminNotification=await runtime.notification.findFirst({where:{user_id:demoId(1)}});
      if(adminNotification) await post(employeeAgent,`/notifications/${adminNotification.id}/read`).expect(200).then(r=>assert.equal(r.body.data.updated,0));
      await post(employeeAgent,'/notifications/read-all').expect(200);
    });
    await suite.test('mock integrations remain mock, and configuration never exposes secrets',async()=>{
      const r=await adminAgent.get('/api/v1/integrations').expect(200);assert.ok(r.body.data.connections.every((c:{status:string})=>c.status==='Mock'));
      const check=await post(adminAgent,'/integrations/FFRMS/test').expect(200);assert.equal(check.body.data.verified,false);
      await employeeAgent.get('/api/v1/integrations').expect(403);
      await adminAgent.patch('/api/v1/integrations/FFRMS').set('X-AEAMS-Request','1').send({mode:'LIVE',base_url:'https://user:password@example.test/api/v1',api_version:'v1',timeout_ms:5000,max_retries:1}).expect(422);
    });
    await suite.test('user creation, role changes and password reset revoke sessions',async()=>{
      const role=oneRole(await runtime.role.findUnique({where:{code:'EMPLOYEE'}}));
      const user=await post(adminAgent,'/users',{email:'new-user@example.test',display_name:'Fictional New Employee',password,role_ids:[role.id]}).expect(201);
      const agent=request.agent(app);await post(agent,'/auth/login',{email:'new-user@example.test',password}).expect(200);
      await adminAgent.patch(`/api/v1/users/${user.body.data.id}`).set('X-AEAMS-Request','1').send({active:false}).expect(200);
      await agent.get('/api/v1/auth/me').expect(401);
      await post(adminAgent,'/auth/password',{current_password:password,new_password:password+'Changed'}).expect(200);
      await adminAgent.get('/api/v1/auth/me').expect(401);
    });
    await suite.test('logout revokes the session and does not leave protected access',async()=>{
      await post(employeeAgent,'/auth/logout').expect(200);await employeeAgent.get('/api/v1/equipment').expect(401);
    });
  } finally {
    if(db)await db.$disconnect();if(fixture)await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);await admin.end();
    assert.ok(uploads.startsWith(path.resolve('.test-data')+path.sep));await rm(uploads,{recursive:true,force:true});
  }
});
function oneRole<T>(v:T|null):T {assert.ok(v);return v;}
