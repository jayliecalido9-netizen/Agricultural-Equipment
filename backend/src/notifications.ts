import type { Prisma, PrismaClient } from '@prisma/client';

export async function notify(tx:Prisma.TransactionClient,userIds:string[],type:string,title:string,message:string,entityId:string,key:string) {
  await tx.notification.createMany({data:[...new Set(userIds)].map(user_id=>({user_id,type,title,message,entity_id:entityId,dedupe_key:`${key}:${user_id}`})),skipDuplicates:true});
}
export async function notifyStaff(tx:Prisma.TransactionClient,permission:string,type:string,title:string,entityId:string,key:string) {
  const users=await tx.user.findMany({where:{active:true,archived_at:null,roles:{some:{role:{permissions:{some:{permission:{code:permission}}}}}}},select:{id:true}});
  await notify(tx,users.map(u=>u.id),type,title,'Open the transaction to review details.',entityId,key);
}
export async function notifyBorrower(tx:Prisma.TransactionClient,record:{requested_by:string;farmer_id:string},type:string,title:string,message:string,entityId:string,key:string) {
  const accounts=await tx.user.findMany({where:{farmer_reference_id:record.farmer_id,active:true,archived_at:null},select:{id:true}});
  await notify(tx,[record.requested_by,...accounts.map(u=>u.id)],type,title,message,entityId,key);
}
export async function generateReminders(db:PrismaClient) {
  await db.$transaction(async tx=>{
    const [lock]=await tx.$queryRaw<{locked:boolean}[]>`SELECT pg_try_advisory_xact_lock(51006) AS locked`;
    if (!lock.locked) return;
    const now=new Date(),tomorrow=new Date(Date.now()+86400000);
    await tx.reservation.updateMany({where:{status:{in:['PENDING','APPROVED']},ends_at:{lt:now}},data:{status:'EXPIRED'}});
    await tx.borrowingTransaction.updateMany({where:{status:'RELEASED',expected_return_at:{lt:now}},data:{status:'OVERDUE'}});
    const loans=await tx.borrowingTransaction.findMany({where:{status:{in:['RELEASED','OVERDUE']},expected_return_at:{lte:tomorrow}},select:{id:true,requested_by:true,farmer_id:true,expected_return_at:true,reference_code:true}});
    for (const loan of loans) {
      const overdue=loan.expected_return_at<now,type=overdue?'OVERDUE_RETURN':'UPCOMING_RETURN';
      const title=`${overdue?'Overdue equipment':'Upcoming equipment return'} · ${loan.reference_code}`;
      await notifyBorrower(tx,loan,type,title,'Please coordinate equipment return with the MAO.',loan.id,`${type}:${loan.id}`);
      await notifyStaff(tx,'return.record',type,title,loan.id,`${type}:${loan.id}`);
    }
    const works=await tx.maintenanceWorkOrder.findMany({where:{status:'SCHEDULED',starts_at:{lte:tomorrow}}});
    for (const work of works) {
      const type=work.starts_at<now?'OVERDUE_MAINTENANCE':'UPCOMING_MAINTENANCE';
      if (work.assigned_to) await notify(tx,[work.assigned_to],type,`${type==='OVERDUE_MAINTENANCE'?'Maintenance overdue':'Upcoming maintenance'} · ${work.reference_code}`,'Review your assigned work order.',work.id,`${type}:${work.id}`);
      await notifyStaff(tx,'maintenance.write',type,`Maintenance alert · ${work.reference_code}`,work.id,`${type}:${work.id}`);
    }
    const schedules=await tx.maintenanceSchedule.findMany({where:{active:true,next_due_at:{lte:tomorrow}}});
    for (const schedule of schedules) await notifyStaff(tx,'maintenance.write','MAINTENANCE_DUE',`Recurring maintenance due · ${schedule.title}`,schedule.equipment_id,`schedule:${schedule.id}:${schedule.next_due_at.toISOString()}`);
  },{timeout:30000});
}
