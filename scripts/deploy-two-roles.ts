import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { demoId } from '../backend/prisma/seed-data.js';

async function snapshot(){const db=new PrismaClient({datasources:{db:{url:process.env.APP_DATABASE_URL}}});try{
  const [equipment,reservations,borrowings,returns,maintenance,images]=await Promise.all([
    db.equipment.findMany({select:{id:true}}),db.reservation.findMany({select:{id:true}}),db.borrowingTransaction.findMany({select:{id:true}}),db.returnTransaction.findMany({select:{id:true}}),db.maintenanceWorkOrder.findMany({select:{id:true}}),db.equipmentImage.findMany({select:{id:true}})]);
  return {equipment,reservations,borrowings,returns,maintenance,images};
}finally{await db.$disconnect();}}
async function main(){
  assert.ok(process.env.APP_DATABASE_URL);assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.APP_DATABASE_URL).hostname));
  const before=await snapshot();
  const run=async(args:string[])=>{await promisify(execFile)('docker',args,{timeout:240000,maxBuffer:8*1024*1024});};
  await run(['compose','build','backend','frontend','db-migrate','db-tools']);console.log('Two-role Docker images built.');
  await run(['compose','up','-d','--wait']);
  const after=await snapshot();
  for(const key of Object.keys(before) as (keyof typeof before)[]){const ids=new Set(after[key].map(r=>r.id));assert.ok(before[key].every(r=>ids.has(r.id)),`${key} history must be preserved.`);}
  const db=new PrismaClient({datasources:{db:{url:process.env.APP_DATABASE_URL}}});try{
    const roles=await db.role.findMany({orderBy:{code:'asc'},select:{code:true}});assert.deepEqual(roles.map(r=>r.code),['ADMIN','EMPLOYEE']);
    const demo=await db.user.findMany({where:{id:{in:[1,2,3,4].map(demoId)},active:true,archived_at:null},select:{email:true}});assert.equal(demo.length,2);
    console.log('Two roles and two active demo accounts verified. All existing equipment, transaction, maintenance, and image records were preserved.');
  }finally{await db.$disconnect();}
}
main().catch(()=>{console.error('Two-role deployment failed. Inspect Docker/migration logs; no credentials were printed.');process.exitCode=1;});
