import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const run=async(args:string[])=>{await promisify(execFile)('docker',args,{timeout:120000});};
async function snapshot(connectionString:string){const client=new pg.Client({connectionString,connectionTimeoutMillis:3000});try{await client.connect();return (await client.query(`SELECT
 (SELECT count(*)::int FROM aeams.equipment) AS equipment,
 (SELECT count(*)::int FROM aeams.reservations) AS reservations,
 (SELECT count(*)::int FROM aeams.borrowing_transactions) AS borrowings,
 (SELECT count(*)::int FROM aeams.return_transactions) AS returns,
 (SELECT count(*)::int FROM aeams.maintenance_work_orders) AS work_orders,
 (SELECT asset_code FROM aeams.equipment WHERE id='00000000-0000-4000-8000-000000000064') AS demo_asset`)).rows[0];}finally{await client.end();}}
async function main(){
 if(!process.env.APP_DATABASE_URL||!process.env.POSTGRES_ADMIN_PASSWORD)throw new Error('Configure the local PostgreSQL application first.');
 const before=await snapshot(process.env.APP_DATABASE_URL);
 await run(['compose','restart','db']);await run(['compose','up','-d','--wait','db']);
 const after=await snapshot(process.env.APP_DATABASE_URL);assert.deepEqual(after,before);console.log('PostgreSQL restart persistence verified:',after);
 const names=(await readdir('backups')).filter(name=>/^agriconnect-\d{8}-\d{6}\.dump$/.test(name)).sort();assert.ok(names.length,'Run Backup-Database.ps1 first.');
 const databaseName=`aeams_restore_${randomUUID().replaceAll('-','')}`,containerPath=`/tmp/${databaseName}.dump`;assert.match(databaseName,/^aeams_restore_[a-f0-9]{32}$/);
 const url=new URL(process.env.APP_DATABASE_URL);url.username='postgres';url.password=process.env.POSTGRES_ADMIN_PASSWORD;
 const admin=new pg.Client({connectionString:url.toString()});await admin.connect();let created=false,copied=false;
 try{
   await admin.query(`CREATE DATABASE "${databaseName}"`);created=true;
   await run(['compose','cp',path.resolve('backups',names.at(-1)!),`db:${containerPath}`]);copied=true;
   await run(['compose','exec','-T','db','pg_restore','-U','postgres','--exit-on-error',`--dbname=${databaseName}`,containerPath]);
   const restoredUrl=new URL(url);restoredUrl.pathname=`/${databaseName}`;const restored=await snapshot(restoredUrl.toString());assert.deepEqual(restored,before);
   console.log('Binary backup restoration verified in an isolated drill database.');
 }finally{
   if(created)await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);await admin.end();
   if(copied)await run(['compose','exec','-T','db','rm','--',containerPath]);
 }
 const health=await fetch('http://localhost:5000/api/v1/health');assert.ok(health.ok);console.log('API database connection recovered after PostgreSQL restart.');
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Persistence/restore verification failed. Check Docker health and the local backup.');process.exitCode=1;});
