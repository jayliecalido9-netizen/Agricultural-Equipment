import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { compare } from 'bcryptjs';
import { demoId, seedReferenceData, seedDemoData, type SeedDatabase } from '../prisma/seed-data.js';

const database = new PGlite({ extensions: { btree_gist } });
const migrationsDirectory = path.resolve('backend/prisma/migrations');
const actor = demoId(1001), asset = demoId(1005), farmer = demoId(1006);
const reservation = demoId(1010), loan = demoId(1011), work = demoId(1012), inspection = demoId(1013);

before(async () => {
  await database.exec('CREATE ROLE aeams_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
  await database.exec('CREATE SCHEMA aeams');
  for (const directory of (await readdir(migrationsDirectory)).filter(n => !n.endsWith('.toml')).sort()) {
    await database.exec(await readFile(path.join(migrationsDirectory, directory, 'migration.sql'), 'utf8'));
  }
});
after(async () => { await database.close(); });

async function fixture(db: SeedDatabase) {
  await db.query(`INSERT INTO aeams.users(id,email,display_name,erp_subject) VALUES ($1,'tester@example.test','Fictional Tester','test-subject')`,[actor]);
  await db.query(`INSERT INTO aeams.equipment_categories(id,name) VALUES ($1,'Test Category')`,[demoId(1002)]);
  await db.query(`INSERT INTO aeams.equipment_locations(id,code,name,is_demo) VALUES ($1,'TEST','Fictional test location',true)`,[demoId(1003)]);
  await db.query(`INSERT INTO aeams.equipment(id,asset_code,name,category_id,location_id) VALUES ($1,'TEST-001','Test tractor',$2,$3)`,[asset,demoId(1002),demoId(1003)]);
  await db.query(`INSERT INTO aeams.farmer_references(id,source,external_farmer_id,display_name,verified_at,valid_until,is_demo)
    VALUES ($1,'MOCK','TEST-FARMER','Fictional Farmer',now()-interval '1 day',now()+interval '1 day',true)`,[farmer]);
}
function databaseTest(name: string, fn: (db: SeedDatabase) => Promise<void>) {
  test(name, async () => {
    const rollback = new Error('test rollback');
    try {
      await database.transaction(async tx => {
        await fixture(tx);
        await fn(tx);
        await tx.query('SET CONSTRAINTS ALL IMMEDIATE');
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  });
}
async function rejected(db: SeedDatabase, sql: string, params: unknown[], code = '23514') {
  await db.query('SAVEPOINT expected_failure');
  try {
    await assert.rejects(db.query(sql, params), (e: unknown) => {
      assert.equal((e as {code: string}).code, code); return true;
    });
  } finally {
    await db.query('ROLLBACK TO SAVEPOINT expected_failure');
    await db.query('RELEASE SAVEPOINT expected_failure');
  }
}
async function rejectedOperation(db: SeedDatabase, operation: () => Promise<unknown>, message: RegExp) {
  await db.query('SAVEPOINT rejected_operation');
  try { await assert.rejects(operation(),message); }
  finally { await db.query('ROLLBACK TO SAVEPOINT rejected_operation'); await db.query('RELEASE SAVEPOINT rejected_operation'); }
}
async function requestReservation(db: SeedDatabase, id = reservation, start = '2 days', end = '3 days') {
  await db.query(`INSERT INTO aeams.reservations(id,reference_code,equipment_id,farmer_id,requested_by,starts_at,ends_at,purpose,usage_location)
    VALUES ($1,$2,$3,$4,$5,now()+$6::interval,now()+$7::interval,'Test request','Fictional test farm')`, [id,id,asset,farmer,actor,start,end]);
}
async function approveReservation(db: SeedDatabase, id = reservation) {
  await db.query(`UPDATE aeams.reservations SET status='APPROVED', approved_by=$1 WHERE id=$2`,[actor,id]);
}
async function requestLoan(db: SeedDatabase, id = loan, linked: string|null = null, start = '-2 days', end = '1 day') {
  await db.query(`INSERT INTO aeams.borrowing_transactions(id,reference_code,equipment_id,farmer_id,requested_by,reservation_id,starts_at,expected_return_at,purpose)
    VALUES ($1,$2,$3,$4,$5,$6,now()+$7::interval,now()+$8::interval,'Test borrowing')`,[id,id,asset,farmer,actor,linked,start,end]);
}
async function approveLoan(db: SeedDatabase, id = loan) {
  await db.query(`UPDATE aeams.borrowing_transactions SET status='APPROVED', approved_by=$1 WHERE id=$2`,[actor,id]);
}
async function releaseLoan(db: SeedDatabase, id = loan) {
  await db.query(`UPDATE aeams.borrowing_transactions SET status='RELEASED', released_by=$1, release_condition='GOOD', released_at=starts_at WHERE id=$2`,[actor,id]);
}
async function scheduleWork(db: SeedDatabase, start = '2 days', end = '3 days') {
  await db.query(`INSERT INTO aeams.maintenance_work_orders(id,reference_code,equipment_id,type,description,starts_at,ends_at)
    VALUES ($1,'TEST-WORK',$2,'PREVENTIVE','Test maintenance',now()+$3::interval,now()+$4::interval)`,[work,asset,start,end]);
}
async function inspect(db: SeedDatabase, condition = 'GOOD', damage: string|null = null, missing: string|null = null) {
  await db.query(`INSERT INTO aeams.equipment_inspections(id,equipment_id,borrowing_id,inspector_id,condition,damage_description,missing_accessories,inspected_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,now())`,[inspection,asset,loan,actor,condition,damage,missing]);
}
async function recordReturn(db: SeedDatabase) {
  await db.query(`INSERT INTO aeams.return_transactions(reference_code,borrowing_id,inspection_id,received_by,returned_at)
    VALUES ('TEST-RETURN',$1,$2,$3,now())`,[loan,inspection,actor]);
}

databaseTest('creates all 27 domain tables with UUID primary keys', async db => {
  const result = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='aeams' AND table_type='BASE TABLE'`);
  assert.equal(result.rows.length,27);
  const invalid = await db.query(`SELECT table_name FROM information_schema.columns WHERE table_schema='aeams' AND column_name='id' AND udt_name <> 'uuid'`);
  assert.equal(invalid.rows.length,0);
});
databaseTest('equipment codes are unique and linked equipment cannot be deleted', async db => {
  await rejected(db,`UPDATE aeams.equipment SET acquisition_cost=-1 WHERE id=$1`,[asset]);
  await rejected(db,`DELETE FROM aeams.equipment WHERE id=$1`,[asset]);
  await rejected(db,`INSERT INTO aeams.equipment(asset_code,name,category_id,location_id) SELECT asset_code,name,category_id,location_id FROM aeams.equipment WHERE id=$1`,[asset],'23505');
});
databaseTest('equipment edits update timestamps and append a sanitized audit record', async db => {
  await db.query(`SELECT set_config('aeams.actor_id',$1,true),set_config('aeams.request_id','test-request',true)`,[actor]);
  await db.query(`UPDATE aeams.equipment SET name='Updated tractor' WHERE id=$1`,[asset]);
  const result = await db.query(`SELECT * FROM aeams.audit_logs WHERE entity_id=$1 AND action='UPDATE'`,[asset]);
  assert.equal(result.rows[0].actor_id,actor);
  assert.equal(result.rows[0].request_id,'test-request');
  assert.ok(!JSON.stringify(result.rows[0]).includes('Updated tractor'));
});
databaseTest('archived equipment cannot receive new requests', async db => {
  await db.query(`UPDATE aeams.equipment SET archived_at=now() WHERE id=$1`,[asset]);
  await rejectedOperation(db,()=>requestReservation(db),/Archived equipment/);
});
databaseTest('approved reservations cannot overlap', async db => {
  await requestReservation(db); await approveReservation(db);
  const other = demoId(1020); await requestReservation(db,other,'2 days 1 hour','4 days');
  await rejected(db,`UPDATE aeams.reservations SET status='APPROVED',approved_by=$1 WHERE id=$2`,[actor,other],'23P01');
});
databaseTest('adjacent half-open bookings are permitted', async db => {
  await requestReservation(db); await approveReservation(db);
  const other = demoId(1020); await requestReservation(db,other,'3 days','4 days'); await approveReservation(db,other);
});
databaseTest('cancelling a reservation releases its calendar block', async db => {
  await requestReservation(db); await approveReservation(db);
  await db.query(`UPDATE aeams.reservations SET status='CANCELLED' WHERE id=$1`,[reservation]);
  assert.equal((await db.query('SELECT * FROM aeams.equipment_bookings')).rows.length,0);
});
databaseTest('equipment with committed bookings cannot be archived', async db => {
  await requestReservation(db); await approveReservation(db);
  await rejected(db,`UPDATE aeams.equipment SET archived_at=now() WHERE id=$1`,[asset]);
});
databaseTest('approval requires a currently verified borrower', async db => {
  await requestReservation(db);
  await db.query(`UPDATE aeams.farmer_references SET valid_until=now()-interval '1 hour' WHERE id=$1`,[farmer]);
  await rejected(db,`UPDATE aeams.reservations SET status='APPROVED',approved_by=$1 WHERE id=$2`,[actor,reservation]);
});
databaseTest('local farmer fallback requires explicit authorization and a reason', async db => {
  await rejected(db,`INSERT INTO aeams.farmer_references(source,external_farmer_id,display_name) VALUES ('LOCAL_FALLBACK','LOCAL-1','Fictional Local Farmer')`,[]);
});
databaseTest('approval requires an approver and rejection requires a reason', async db => {
  await requestReservation(db);
  await rejected(db,`UPDATE aeams.reservations SET status='APPROVED' WHERE id=$1`,[reservation]);
  await rejected(db,`UPDATE aeams.reservations SET status='REJECTED' WHERE id=$1`,[reservation]);
});
databaseTest('borrowing approval transfers the linked reservation atomically', async db => {
  await requestReservation(db); await approveReservation(db);
  await requestLoan(db,loan,reservation,'2 days','3 days'); await approveLoan(db);
  assert.equal((await db.query('SELECT status FROM aeams.reservations WHERE id=$1',[reservation])).rows[0].status,'FULFILLED');
  const bookings = (await db.query('SELECT * FROM aeams.equipment_bookings')).rows;
  assert.equal(bookings.length,1); assert.equal(bookings[0].source_type,'BORROWING');
});
databaseTest('loan approval conflicts with a reservation for another request', async db => {
  await requestReservation(db); await approveReservation(db);
  await requestLoan(db,loan,null,'2 days','3 days');
  await rejected(db,`UPDATE aeams.borrowing_transactions SET status='APPROVED',approved_by=$1 WHERE id=$2`,[actor,loan],'23P01');
});
databaseTest('duplicate active borrowing is prevented', async db => {
  await requestLoan(db); await approveLoan(db); await releaseLoan(db);
  const other = demoId(1020); await requestLoan(db,other);
  await rejected(db,`UPDATE aeams.borrowing_transactions SET status='APPROVED',approved_by=$1 WHERE id=$2`,[actor,other],'23P01');
});
databaseTest('active borrowing blocks future dates until the equipment is returned', async db => {
  await requestLoan(db); await approveLoan(db); await releaseLoan(db);
  await requestReservation(db,reservation,'30 days','31 days');
  await rejected(db,`UPDATE aeams.reservations SET status='APPROVED',approved_by=$1 WHERE id=$2`,[actor,reservation],'23P01');
});
databaseTest('release cannot skip approval or omit release inspection condition', async db => {
  await requestLoan(db);
  await rejected(db,`UPDATE aeams.borrowing_transactions SET status='RELEASED',approved_by=$1,released_by=$1,released_at=starts_at,release_condition='GOOD' WHERE id=$2`,[actor,loan]);
  await approveLoan(db);
  await rejected(db,`UPDATE aeams.borrowing_transactions SET status='RELEASED',released_by=$1,released_at=starts_at WHERE id=$2`,[actor,loan]);
});
databaseTest('maintenance conflicts with reservations and borrowing approvals', async db => {
  await scheduleWork(db);
  await requestReservation(db); await requestLoan(db,loan,null,'2 days','3 days');
  await rejected(db,`UPDATE aeams.reservations SET status='APPROVED',approved_by=$1 WHERE id=$2`,[actor,reservation],'23P01');
  await rejected(db,`UPDATE aeams.borrowing_transactions SET status='APPROVED',approved_by=$1 WHERE id=$2`,[actor,loan],'23P01');
});
databaseTest('maintenance cannot start while equipment is physically on loan', async db => {
  await requestLoan(db); await approveLoan(db); await releaseLoan(db);
  await rejectedOperation(db,()=>scheduleWork(db,'4 days','5 days'),/conflicting key/);
});
databaseTest('return requires an existing matching inspection', async db => {
  await requestLoan(db); await approveLoan(db); await releaseLoan(db);
  await rejectedOperation(db,()=>recordReturn(db),/returned no rows/);
});
databaseTest('good return closes the borrowing and makes equipment available', async db => {
  await requestLoan(db); await approveLoan(db); await releaseLoan(db); await inspect(db); await recordReturn(db);
  assert.equal((await db.query('SELECT status FROM aeams.borrowing_transactions WHERE id=$1',[loan])).rows[0].status,'RETURNED');
  assert.equal((await db.query('SELECT availability FROM aeams.equipment_availability WHERE id=$1',[asset])).rows[0].availability,'AVAILABLE');
});
databaseTest('damaged return stays unavailable and prevents new approvals', async db => {
  await requestLoan(db); await approveLoan(db); await releaseLoan(db); await inspect(db,'DAMAGED','Cracked housing'); await recordReturn(db);
  assert.equal((await db.query('SELECT availability FROM aeams.equipment_availability WHERE id=$1',[asset])).rows[0].availability,'UNAVAILABLE');
  await requestReservation(db);
  await rejected(db,`UPDATE aeams.reservations SET status='APPROVED',approved_by=$1 WHERE id=$2`,[actor,reservation]);
});
databaseTest('missing accessories override a good return condition', async db => {
  await requestLoan(db); await approveLoan(db); await releaseLoan(db); await inspect(db,'GOOD',null,'Missing safety cover'); await recordReturn(db);
  assert.equal((await db.query('SELECT condition FROM aeams.equipment WHERE id=$1',[asset])).rows[0].condition,'DAMAGED');
});
databaseTest('inspection and return history cannot be edited or deleted', async db => {
  await requestLoan(db); await approveLoan(db); await releaseLoan(db); await inspect(db); await recordReturn(db);
  await rejected(db,`UPDATE aeams.equipment_inspections SET condition='FAIR' WHERE id=$1`,[inspection]);
  await rejected(db,`DELETE FROM aeams.return_transactions WHERE borrowing_id=$1`,[loan]);
});
databaseTest('direct returned status requires deferred return evidence', async db => {
  await requestLoan(db); await approveLoan(db); await releaseLoan(db);
  await db.query('SAVEPOINT evidence');
  await db.query(`UPDATE aeams.borrowing_transactions SET status='RETURNED' WHERE id=$1`,[loan]);
  await assert.rejects(db.query('SET CONSTRAINTS ALL IMMEDIATE'),/requires an inspection-backed/);
  await db.query('ROLLBACK TO SAVEPOINT evidence');
});
databaseTest('maintenance completion releases calendar block but does not repair condition implicitly', async db => {
  await db.query(`UPDATE aeams.equipment SET condition='DAMAGED' WHERE id=$1`,[asset]);
  await scheduleWork(db,'-2 days','1 day');
  await db.query(`UPDATE aeams.maintenance_work_orders SET status='IN_PROGRESS' WHERE id=$1`,[work]);
  await rejected(db,`UPDATE aeams.maintenance_work_orders SET status='COMPLETED' WHERE id=$1`,[work]);
  await db.query(`UPDATE aeams.maintenance_work_orders SET status='COMPLETED',completed_at=now() WHERE id=$1`,[work]);
  assert.equal((await db.query('SELECT * FROM aeams.equipment_bookings')).rows.length,0);
  assert.equal((await db.query('SELECT availability FROM aeams.equipment_availability WHERE id=$1',[asset])).rows[0].availability,'UNAVAILABLE');
});
databaseTest('overdue view derives deadlines without a status-update job', async db => {
  await requestLoan(db,loan,null,'-3 days','-1 day'); await approveLoan(db); await releaseLoan(db);
  assert.equal((await db.query('SELECT * FROM aeams.overdue_borrowings')).rows.length,1);
  assert.equal(Number((await db.query('SELECT overdue_equipment FROM aeams.dashboard_summary')).rows[0].overdue_equipment),1);
});
databaseTest('incoming events and outgoing operations have idempotency keys', async db => {
  const insertEvent = `INSERT INTO aeams.integration_events(module,external_event_id,event_type,payload) VALUES ('FFRMS','E-1','farmer.verified.v1','{}')`;
  await db.query(insertEvent); await rejected(db,insertEvent,[],'23505');
  const insertOutbox = `INSERT INTO aeams.integration_outbox(target_module,event_type,aggregate_id,idempotency_key,payload) VALUES ('APMS','usage.recorded.v1',$1,'K-1','{}')`;
  await db.query(insertOutbox,[asset]); await rejected(db,insertOutbox,[asset],'23505');
});
databaseTest('integration reference setup is repeatable and never claims a connection', async db => {
  await seedReferenceData(db); await seedReferenceData(db);
  assert.equal((await db.query('SELECT * FROM aeams.roles')).rows.length,2);
  const modes = (await db.query('SELECT mode FROM aeams.integration_connections')).rows;
  assert.equal(modes.length,5); assert.ok(modes.every(row=>row.mode==='DISABLED'));
  const permission = await db.query(`SELECT 1 FROM aeams.role_permissions rp JOIN aeams.roles r ON r.id=rp.role_id
    JOIN aeams.permissions p ON p.id=rp.permission_id WHERE r.code='EMPLOYEE' AND p.code='borrowing.approve'`);
  assert.equal(permission.rows.length,0);
});

databaseTest('restricted runtime role can execute workflows but cannot alter audit or booking projections', async db => {
  await db.query('SET LOCAL ROLE aeams_app');
  await requestReservation(db); await approveReservation(db);
  await rejected(db,`UPDATE aeams.audit_logs SET action='FORGED'`,[],'42501');
  await rejected(db,`INSERT INTO aeams.equipment_bookings(equipment_id,source_type,source_id,starts_at,ends_at)
    VALUES ($1,'RESERVATION',$2,now(),now()+interval '1 day')`,[asset,demoId(1020)],'42501');
  await rejected(db,`DELETE FROM aeams.reservations`,[],'42501');
  await rejected(db,`CREATE TABLE aeams.forbidden(id int)`,[],'42501');
  await db.query('RESET ROLE');
});

databaseTest('role assignment revocation is audited and bootstrap preserves policy edits', async db => {
  await seedReferenceData(db);
  const roleId = (await db.query(`SELECT id FROM aeams.roles WHERE code='ADMIN'`)).rows[0].id;
  const mapping = (await db.query(`INSERT INTO aeams.user_roles(user_id,role_id) VALUES ($1,$2) RETURNING id`,[actor,roleId])).rows[0].id;
  await db.query('SET LOCAL ROLE aeams_app');
  await db.query('DELETE FROM aeams.user_roles WHERE id=$1',[mapping]);
  await db.query('DELETE FROM aeams.role_permissions WHERE role_id=$1',[roleId]);
  await db.query('RESET ROLE');
  await seedReferenceData(db);
  assert.equal((await db.query('SELECT * FROM aeams.role_permissions WHERE role_id=$1',[roleId])).rows.length,0);
  const record = (await db.query(`SELECT metadata FROM aeams.audit_logs WHERE table_name='user_roles' AND action='DELETE' AND entity_id=$1`,[mapping])).rows[0];
  assert.equal((record.metadata as {user_id:string}).user_id,actor);
});

databaseTest('approved dates and release evidence cannot be rewritten', async db => {
  await requestLoan(db); await approveLoan(db); await releaseLoan(db);
  await rejected(db,`UPDATE aeams.borrowing_transactions SET expected_return_at=expected_return_at+interval '1 day' WHERE id=$1`,[loan]);
  await rejected(db,`UPDATE aeams.borrowing_transactions SET release_condition='FAIR' WHERE id=$1`,[loan]);
});

databaseTest('only Admin and Employee roles exist and each account can hold one role', async db => {
  const roles=(await db.query('SELECT id,code FROM aeams.roles ORDER BY code')).rows;
  assert.deepEqual(roles.map(r=>r.code),['ADMIN','EMPLOYEE']);
  await rejected(db,`INSERT INTO aeams.roles(code,name) VALUES ('LEGACY_ROLE','Unsupported role')`,[]);
  await db.query(`INSERT INTO aeams.user_roles(user_id,role_id) VALUES ($1,$2)`,[actor,roles[0].id]);
  await rejected(db,`INSERT INTO aeams.user_roles(user_id,role_id) VALUES ($1,$2)`,[actor,roles[1].id],'23505');
});

test('upgrading legacy roles preserves transactions and retains two active demo identities', async()=>{
  const legacy=new PGlite({extensions:{btree_gist}});
  try{
    await legacy.exec('CREATE SCHEMA aeams');
    const directories=(await readdir(migrationsDirectory)).filter(n=>!n.endsWith('.toml')).sort();
    for(const directory of directories.filter(n=>!n.includes('000600_'))) await legacy.exec(await readFile(path.join(migrationsDirectory,directory,'migration.sql'),'utf8'));
    await fixture(legacy);
    for(const [number,email,name,role] of [[1,'admin@example.test','Fictional MAO Administrator','MAO_ADMIN'],[2,'technician@example.test','Fictional Maintenance Technician','MAINTENANCE_PERSONNEL'],[3,'officer@example.test','Fictional Agricultural Officer','AGRICULTURAL_OFFICER'],[4,'borrower@example.test','Fictional Farmer Ana Demo','FARMER_BORROWER']] as const){
      await legacy.query('INSERT INTO aeams.roles(code,name) VALUES ($1,$1)',[role]);
      await legacy.query('INSERT INTO aeams.users(id,email,display_name,erp_subject) VALUES ($1,$2,$3,$4)',[demoId(number),email,name,'legacy-'+number]);
      await legacy.query('INSERT INTO aeams.user_roles(user_id,role_id) SELECT $1,id FROM aeams.roles WHERE code=$2',[demoId(number),role]);
    }
    await legacy.query(`INSERT INTO aeams.borrowing_transactions(reference_code,equipment_id,farmer_id,requested_by,starts_at,expected_return_at,purpose)
      VALUES ('LEGACY-HISTORY',$1,$2,$3,now()-interval '1 day',now()+interval '1 day','Preserved legacy transaction')`,[asset,farmer,demoId(4)]);
    const upgrade=directories.find(n=>n.includes('000600_'));assert.ok(upgrade);
    await legacy.exec(await readFile(path.join(migrationsDirectory,upgrade,'migration.sql'),'utf8'));
    assert.deepEqual((await legacy.query<{code:string}>('SELECT code FROM aeams.roles ORDER BY code')).rows.map(r=>r.code),['ADMIN','EMPLOYEE']);
    const accounts=(await legacy.query<{id:string;email:string;active:boolean;code:string}>(`SELECT u.id,u.email,u.active,r.code FROM aeams.users u JOIN aeams.user_roles ur ON ur.user_id=u.id JOIN aeams.roles r ON r.id=ur.role_id ORDER BY u.id`)).rows;
    assert.equal(accounts.filter(u=>u.active).length,2);assert.equal(accounts[0].code,'ADMIN');assert.equal(accounts[1].code,'EMPLOYEE');assert.equal(accounts[1].email,'employee@example.test');
    assert.ok(accounts.slice(2).every(u=>!u.active));
    const history=(await legacy.query<{requested_by:string}>("SELECT requested_by FROM aeams.borrowing_transactions WHERE reference_code='LEGACY-HISTORY'")).rows[0];assert.equal(history.requested_by,demoId(4));
    assert.equal((await legacy.query('SELECT * FROM aeams.equipment')).rows.length,1);
  }finally{await legacy.close();}
});

test('fictional demo seed is internally consistent, hashed and idempotent', async () => {
  const rollback = new Error('demo rollback');
  try {
    await database.transaction(async db => {
      await seedReferenceData(db);
      assert.equal(await seedDemoData(db,'demo@example.test','Local789x'),true);
      assert.equal(await seedDemoData(db,'demo@example.test','Local789x'),false);
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      const summary = (await db.query('SELECT * FROM aeams.dashboard_summary')).rows[0] as Record<string,unknown>;
      assert.equal(Number(summary.total_equipment),9); assert.equal(Number(summary.borrowed_equipment),2);
      assert.equal(Number(summary.overdue_equipment),1); assert.equal(Number(summary.under_maintenance),1);
      assert.equal(Number(summary.pending_requests),1);
      const passwordHash = (await db.query<{password_hash:string}>('SELECT password_hash FROM aeams.users WHERE id=$1',[demoId(1)])).rows[0].password_hash;
      assert.ok(await compare('Local789x',passwordHash));
      throw rollback;
    });
  } catch(e) { if (e !== rollback) throw e; }
});
