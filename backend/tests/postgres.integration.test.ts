import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import pg from 'pg';
import { demoId } from '../prisma/seed-data.js';

// Explicitly provided DBA connection. Each run creates and drops its OWN empty database.
// Never uses the application database as a test target.
const administratorUrl = process.env.POSTGRES_TEST_ADMIN_URL;
test('real PostgreSQL: Prisma deploy, concurrent approvals, and runtime privileges', { skip: !administratorUrl, timeout: 60000 }, async () => {
  const databaseName = `aeams_test_${randomUUID().replaceAll('-','')}`;
  assert.match(databaseName,/^aeams_test_[0-9a-f]{32}$/);
  const admin = new pg.Client({ connectionString: administratorUrl });
  const isolatedUrl = new URL(administratorUrl!);
  isolatedUrl.pathname = `/${databaseName}`;
  isolatedUrl.searchParams.set('schema','aeams');
  const clients: pg.Client[] = [];
  let created = false;
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const setup=new pg.Client({connectionString:isolatedUrl.toString()});await setup.connect();try {await setup.query('CREATE SCHEMA aeams');} finally {await setup.end();}
    // Verifies checked-in Prisma migrations using the actual deployment command.
    await promisify(execFile)(process.execPath,[path.resolve('node_modules/prisma/build/index.js'),'migrate','deploy','--schema','backend/prisma/schema.prisma'],
      { env: { ...process.env, DATABASE_URL: isolatedUrl.toString() }, timeout: 30000 });
    for (let index=0; index<3; index++) {
      const client = new pg.Client({ connectionString: isolatedUrl.toString() });
      clients.push(client); await client.connect();
    }
    const [observer, first, second] = clients;
    const actor=demoId(1), asset=demoId(2), farmer=demoId(3);
    await observer.query(`INSERT INTO aeams.users(id,email,display_name,erp_subject) VALUES ($1,'test@example.test','Fictional tester','test')`,[actor]);
    await observer.query(`INSERT INTO aeams.equipment_categories(id,name) VALUES ($1,'Test')`,[demoId(4)]);
    await observer.query(`INSERT INTO aeams.equipment_locations(id,code,name) VALUES ($1,'TEST','Fictional')`,[demoId(5)]);
    await observer.query(`INSERT INTO aeams.equipment(id,asset_code,name,category_id,location_id) VALUES ($1,'TEST-1','Test tractor',$2,$3)`,[asset,demoId(4),demoId(5)]);
    await observer.query(`INSERT INTO aeams.farmer_references(id,source,external_farmer_id,display_name,is_demo,verified_at,valid_until)
      VALUES ($1,'MOCK','F-1','Fictional farmer',true,now(),now()+interval '1 day')`,[farmer]);
    await observer.query(`INSERT INTO aeams.reservations(id,reference_code,equipment_id,farmer_id,requested_by,starts_at,ends_at,purpose,usage_location)
      VALUES ($1,'R-1',$3,$4,$5,now()+interval '1 day',now()+interval '2 days','Test','Fictional'),
             ($2,'R-2',$3,$4,$5,now()+interval '1 day',now()+interval '2 days','Test','Fictional')`,[demoId(10),demoId(11),asset,farmer,actor]);
    await first.query('BEGIN'); await second.query('BEGIN');
    await first.query(`UPDATE aeams.reservations SET status='APPROVED',approved_by=$1 WHERE id=$2`,[actor,demoId(10)]);
    const secondPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const competing = second.query(`UPDATE aeams.reservations SET status='APPROVED',approved_by=$1 WHERE id=$2`,[actor,demoId(11)])
      .then(()=>({code:'unexpected-success'}), (error: {code:string})=>({code:error.code}));
    let waiting = false;
    for (let attempt=0; attempt<50; attempt++) {
      const state = await observer.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[secondPid]);
      if (state.rows[0]?.wait_event_type==='Lock') { waiting=true; break; }
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.ok(waiting,'The second approval must wait for the equipment row lock.');
    await first.query('COMMIT');
    assert.equal((await competing).code,'23P01','Exactly one overlapping approval may commit.');
    await second.query('ROLLBACK');
    assert.equal((await observer.query("SELECT count(*)::int AS count FROM aeams.reservations WHERE status='APPROVED'")).rows[0].count,1);
    // The Docker bootstrap must have provisioned the runtime role on this server.
    assert.ok((await observer.query("SELECT 1 FROM pg_roles WHERE rolname='aeams_app'")).rowCount,'Provision aeams_app using the Docker initialization before this test.');
    await observer.query('SET ROLE aeams_app');
    await observer.query('SELECT * FROM aeams.dashboard_summary');
    await assert.rejects(observer.query("UPDATE aeams.audit_logs SET action='FORGED'"),(e:unknown)=>(e as {code:string}).code==='42501');
    await observer.query('RESET ROLE');
  } finally {
    await Promise.allSettled(clients.map(client=>client.end()));
    // The identifier is generated here, verified above, and cannot target an existing user database.
    if (created) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    await admin.end();
  }
});
