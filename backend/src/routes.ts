import type { Express,Request } from 'express';
import type { PrismaClient,Prisma } from '@prisma/client';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,unlink,readFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import type { AppConfig } from './config.js';
import { withActor } from './database.js';
import { borrowerId,condition,date,has,HttpError,one,page,permit,result,text,uuid } from './http.js';
import { notify,notifyStaff,notifyBorrower,generateReminders } from './notifications.js';
import { connectionStatus,integrationContracts,modules,verifyConnection } from './integrations.js';
import { registerReports,utilization } from './reports.js';

const code=(prefix:string)=>`${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0,8).toUpperCase()}`;
const short=text.max(150),nullableText=z.string().trim().max(5000).nullable().optional();
const equipmentBody=z.object({asset_code:short.max(60),name:short,category_id:uuid,location_id:uuid,description:nullableText,
  brand:short.max(100).nullable().optional(),model:short.max(100).nullable().optional(),serial_number:short.nullable().optional(),
  acquisition_date:z.string().date().transform(v=>new Date(v+'T00:00:00Z')).nullable().optional(),acquisition_cost:z.coerce.number().min(0).max(999999999999).nullable().optional(),
  condition:condition.default('GOOD'),maintenance_interval_days:z.coerce.number().int().min(1).max(3650).nullable().optional(),
  notes:nullableText,funding_source:short.nullable().optional(),assigned_office:short.nullable().optional()}).strict();
const reservationBody=z.object({equipment_id:uuid,farmer_id:uuid.optional(),starts_at:date,ends_at:date,purpose:text,usage_location:text.max(250),farm_reference:short.max(200).nullable().optional()}).strict();
const loanBody=z.object({equipment_id:uuid,farmer_id:uuid.optional(),reservation_id:uuid.nullable().optional(),starts_at:date,expected_return_at:date,purpose:text,farm_reference:short.max(200).nullable().optional(),notes:nullableText}).strict();
const maintenanceBody=z.object({equipment_id:uuid,type:z.enum(['PREVENTIVE','CORRECTIVE']),description:text,priority:z.enum(['LOW','NORMAL','HIGH','URGENT']).default('NORMAL'),starts_at:date,ends_at:date,assigned_to:uuid,estimated_cost:z.coerce.number().min(0).max(999999999).default(0),schedule_id:uuid.nullable().optional()}).strict();
const userSelect={id:true,email:true,display_name:true,active:true,archived_at:true,created_at:true,roles:{include:{role:{select:{id:true,code:true,name:true}}}}} satisfies Prisma.UserSelect;
const includeEquipment={category:true,location:true,images:true};

export function registerRoutes(app:Express,db:PrismaClient,config:AppConfig) {
  const base='/api/v1';
  app.get(`${base}/lookups`,permit('equipment.read'),async(req,res)=>{
    const [categories,locations,farmers,personnel,roles,equipment]=await Promise.all([
      db.equipmentCategory.findMany({where:{archived_at:null},orderBy:{name:'asc'}}),db.equipmentLocation.findMany({where:{archived_at:null},orderBy:{name:'asc'}}),
      db.farmerReference.findMany({where:{archived_at:null},select:{id:true,display_name:true,source:true,is_demo:true,external_farmer_id:true,valid_until:true}}),
      db.user.findMany({where:{active:true,archived_at:null,roles:{some:{role:{code:{in:['ADMIN','EMPLOYEE']}}}}},select:{id:true,display_name:true}}),
      has(req.actor,'user.manage')?db.role.findMany({where:{code:{in:['ADMIN','EMPLOYEE']}},orderBy:{name:'asc'}}):[],db.equipment.findMany({where:{archived_at:null},select:{id:true,name:true,asset_code:true},orderBy:{name:'asc'}})]);
    result(res,{categories,locations,farmers,personnel,roles,equipment});
  });
  for (const [resource,model] of [['categories','equipmentCategory'],['locations','equipmentLocation']] as const) {
    app.post(`${base}/${resource}`,permit('equipment.write'),async(req,res)=>{
      const body=(resource==='categories'?z.object({name:short,description:nullableText}):z.object({name:short,code:short.max(50),description:nullableText})).strict().parse(req.body);
      const created=await withActor(db,req.actor.id,req.requestId,tx=>resource==='categories'?tx.equipmentCategory.create({data:body}):tx.equipmentLocation.create({data:body as {name:string;code:string;description?:string|null}}));
      res.status(201);result(res,created);
    });
  }
  app.get(`${base}/equipment`,permit('equipment.read'),async(req,res)=>{
    const q=page(req),filters=z.object({category_id:uuid.optional(),status:z.enum(['AVAILABLE','RESERVED','BORROWED','UNDER_MAINTENANCE','UNAVAILABLE','ARCHIVED']).optional(),archived:z.enum(['true','false']).default('false')}).parse(req.query);
    const availability=await db.$queryRawUnsafe<{id:string;availability:string}[]>('SELECT id,availability FROM aeams.equipment_availability WHERE ($1::text IS NULL OR availability=$1)',filters.status||null);
    const where:Prisma.EquipmentWhereInput={id:{in:availability.map(e=>e.id)},...(filters.archived==='false'?{archived_at:null}:{}),category_id:filters.category_id,
      ...(q.search?{OR:[{name:{contains:q.search,mode:'insensitive'}},{asset_code:{contains:q.search,mode:'insensitive'}},{serial_number:{contains:q.search,mode:'insensitive'}}]}:{})};
    const [rows,total]=await Promise.all([db.equipment.findMany({where,include:includeEquipment,skip:q.skip,take:q.limit,orderBy:{created_at:q.sort}}),db.equipment.count({where})]);
    result(res,rows.map(e=>({...e,availability:availability.find(a=>a.id===e.id)?.availability})),total,q);
  });
  app.get(`${base}/equipment/availability`,permit('equipment.read'),async(req,res)=>{
    const {starts_at,ends_at}=z.object({starts_at:date,ends_at:date}).parse(req.query);
    if (ends_at<=starts_at) throw new HttpError(422,'End date must follow start date.');
    result(res,await db.$queryRaw`SELECT e.id,e.asset_code,e.name FROM aeams.equipment e WHERE e.archived_at IS NULL AND e.condition NOT IN ('DAMAGED','UNSERVICEABLE')
      AND NOT EXISTS (SELECT 1 FROM aeams.equipment_bookings b WHERE b.equipment_id=e.id AND tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(${starts_at},${ends_at},'[)')) ORDER BY e.name`);
  });
  app.get(`${base}/equipment/:id`,permit('equipment.read'),async(req,res)=>{
    const e=one(await db.equipment.findUnique({where:{id:String(req.params.id)},include:{...includeEquipment,schedules:true}}));
    const [availability]=await db.$queryRaw<{availability:string}[]>`SELECT availability FROM aeams.equipment_availability WHERE id=${e.id}::uuid`;
    const history={
      reservations:await db.reservation.findMany({where:{equipment_id:e.id},take:30,orderBy:{created_at:'desc'},include:{farmer:{select:{display_name:true}}}}),
      borrowings:await db.borrowingTransaction.findMany({where:{equipment_id:e.id},take:30,orderBy:{created_at:'desc'},include:{farmer:{select:{display_name:true}},return_transaction:true}}),
      maintenance:await db.maintenanceWorkOrder.findMany({where:{equipment_id:e.id},take:30,orderBy:{created_at:'desc'},include:{records:true}})};
    result(res,{...e,availability:availability.availability,history});
  });
  app.post(`${base}/equipment`,permit('equipment.write'),async(req,res)=>{const data=equipmentBody.parse(req.body);res.status(201);result(res,await withActor(db,req.actor.id,req.requestId,tx=>tx.equipment.create({data})));});
  app.patch(`${base}/equipment/:id`,permit('equipment.write'),async(req,res)=>{const data=equipmentBody.partial().parse(req.body);result(res,await withActor(db,req.actor.id,req.requestId,tx=>tx.equipment.update({where:{id:String(req.params.id)},data})));});
  app.post(`${base}/equipment/:id/archive`,permit('equipment.write'),async(req,res)=>{
    result(res,await withActor(db,req.actor.id,req.requestId,tx=>tx.equipment.update({where:{id:String(req.params.id)},data:{archived_at:new Date()}})));
  });
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:0}});
  app.post(`${base}/equipment/:id/images`,permit('equipment.write'),upload.single('image'),async(req,res)=>{
    one(await db.equipment.findUnique({where:{id:String(req.params.id)}}));
    const file=req.file;
    if (!file) throw new HttpError(422,'Select an image.');
    const data=file.buffer;
    const ext=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':data[0]===255&&data[1]===216&&data[2]===255?'jpg':data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP'?'webp':null;
    if (!ext) throw new HttpError(422,'Use a JPEG, PNG, or WebP image.');
    const key=`${randomUUID()}.${ext}`,directory=path.resolve(config.UPLOAD_DIRECTORY);
    await mkdir(directory,{recursive:true});await writeFile(path.join(directory,key),data,{flag:'wx'});
    try {
      const image=await withActor(db,req.actor.id,req.requestId,async tx=>{
        await tx.$queryRaw`SELECT id FROM aeams.equipment WHERE id=${String(req.params.id)}::uuid FOR UPDATE`;
        await tx.equipmentImage.updateMany({where:{equipment_id:String(req.params.id)},data:{is_primary:false}});
        return tx.equipmentImage.create({data:{equipment_id:String(req.params.id),storage_key:key,content_type:ext==='jpg'?'image/jpeg':`image/${ext}`,size_bytes:data.length,is_primary:true}});
      });res.status(201);result(res,image);
    } catch(error) {await unlink(path.join(directory,key));throw error;}
  });
  app.get(`${base}/images/:id`,permit('equipment.read'),async(req,res)=>{
    const image=one(await db.equipmentImage.findUnique({where:{id:String(req.params.id)}}));
    if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(image.storage_key)) throw new HttpError(404,'Image not found.');
    let bytes:Buffer;try {bytes=await readFile(path.join(path.resolve(config.UPLOAD_DIRECTORY),image.storage_key));}catch{throw new HttpError(404,'Image file is unavailable.');}
    res.type(image.content_type).setHeader('Content-Disposition','inline');res.send(bytes);
  });

  app.get(`${base}/reservations`,permit('reservation.request'),async(req,res)=>{
    const q=page(req),status=z.string().max(30).optional().parse(req.query.status);
    const where:Prisma.ReservationWhereInput={...(status?{status}:{}),...(q.search?{reference_code:{contains:q.search,mode:'insensitive'}}:{})};
    const [rows,total]=await Promise.all([db.reservation.findMany({where,include:{equipment:{select:{name:true,asset_code:true}},farmer:{select:{display_name:true}},borrowing:{select:{id:true,status:true}}},skip:q.skip,take:q.limit,orderBy:{created_at:q.sort}}),db.reservation.count({where})]);result(res,rows,total,q);
  });
  app.post(`${base}/reservations`,permit('reservation.request'),async(req,res)=>{
    const {farmer_id,...body}=reservationBody.parse(req.body);
    if (body.ends_at<=body.starts_at || body.starts_at<new Date(Date.now()-60000)) throw new HttpError(422,'Choose a future start and an end after the start.');
    const farmer=borrowerId(req,farmer_id);
    const created=await withActor(db,req.actor.id,req.requestId,async tx=>{
      const r=await tx.reservation.create({data:{...body,farmer_id:farmer,requested_by:req.actor.id,reference_code:code('RES')}});
      await notifyStaff(tx,'reservation.approve','NEW_RESERVATION',`New reservation · ${r.reference_code}`,r.id,`reservation-created:${r.id}`);return r;
    });res.status(201);result(res,created);
  });
  app.post(`${base}/reservations/:id/:action`,permit('reservation.request'),async(req,res)=>{
    const action=z.enum(['approve','reject','cancel']).parse(req.params.action);
    const body=z.object({reason:text.optional()}).strict().parse(req.body||{});
    const r=one(await db.reservation.findUnique({where:{id:String(req.params.id)}}));
    if (action!=='cancel' && !has(req.actor,'reservation.approve')) throw new HttpError(403,'Reservation approval permission is required.');
    if (action==='reject' && !body.reason) throw new HttpError(422,'Provide a rejection reason.');
    if (action==='approve' && r.ends_at<=new Date()) throw new HttpError(409,'This reservation window has already ended.');
    const updated=await withActor(db,req.actor.id,req.requestId,async tx=>{
      const updated=await tx.reservation.update({where:{id:r.id},data:{status:action==='approve'?'APPROVED':action==='reject'?'REJECTED':'CANCELLED',...(action==='approve'?{approved_by:req.actor.id}:{}),...(action==='reject'?{rejection_reason:body.reason}:{})}});
      await notifyBorrower(tx,r,'RESERVATION_STATUS',`Reservation ${updated.status.toLowerCase()}`,body.reason||r.reference_code,r.id,`reservation:${r.id}:${updated.status}`);return updated;
    });result(res,updated);
  });
  app.get(`${base}/calendar`,permit('equipment.read'),async(req,res)=>{
    const range=z.object({starts_at:date,ends_at:date,equipment_id:uuid.optional()}).parse(req.query);
    if (range.ends_at<=range.starts_at || range.ends_at.getTime()-range.starts_at.getTime()>370*86400000) throw new HttpError(422,'Choose a calendar window of at most one year.');
    const bookings=await db.equipmentBooking.findMany({where:{equipment_id:range.equipment_id,starts_at:{lt:range.ends_at},OR:[{ends_at:null},{ends_at:{gt:range.starts_at}}]},include:{equipment:{select:{name:true,asset_code:true}}},orderBy:{starts_at:'asc'}});
    result(res,bookings); // Contains equipment/date windows only, never other borrowers' identities.
  });

  app.get(`${base}/borrowings`,permit('equipment.read'),async(req,res)=>{
    const q=page(req),filter=z.enum(['active','overdue','all','REQUESTED','APPROVED','RELEASED','RETURNED','CANCELLED']).default('all').parse(req.query.status);
    const where:Prisma.BorrowingTransactionWhereInput={...(filter==='active'?{status:{in:['RELEASED','OVERDUE']}}:filter==='overdue'?{status:{in:['RELEASED','OVERDUE']},expected_return_at:{lt:new Date()}}:filter!=='all'?{status:filter}:{}),...(q.search?{reference_code:{contains:q.search,mode:'insensitive'}}:{})};
    const [rows,total]=await Promise.all([db.borrowingTransaction.findMany({where,include:{equipment:{select:{name:true,asset_code:true}},farmer:{select:{display_name:true}},return_transaction:{include:{inspection:true}},utilization:true},skip:q.skip,take:q.limit,orderBy:{created_at:q.sort}}),db.borrowingTransaction.count({where})]);result(res,rows,total,q);
  });
  app.post(`${base}/borrowings`,permit('borrowing.request'),async(req,res)=>{
    const {farmer_id,...body}=loanBody.parse(req.body);const farmer=borrowerId(req,farmer_id);
    if (body.expected_return_at<=body.starts_at || body.expected_return_at<=new Date()) throw new HttpError(422,'Expected return must follow borrowing and be in the future.');
    const created=await withActor(db,req.actor.id,req.requestId,async tx=>{
      const r=await tx.borrowingTransaction.create({data:{...body,farmer_id:farmer,requested_by:req.actor.id,reference_code:code('BOR')}});
      await notifyStaff(tx,'borrowing.approve','NEW_BORROWING',`Borrowing request · ${r.reference_code}`,r.id,`borrowing-created:${r.id}`);return r;
    });res.status(201);result(res,created);
  });
  app.post(`${base}/borrowings/:id/:action`,permit('equipment.read'),async(req,res)=>{
    const action=z.enum(['approve','reject','cancel','release','return']).parse(req.params.action);
    const loan=one(await db.borrowingTransaction.findUnique({where:{id:String(req.params.id)}}));
    if (action==='return') {
      if (!has(req.actor,'return.record')) throw new HttpError(403,'Return processing permission is required.');
      const body=z.object({returned_at:date,condition,damage_description:nullableText,missing_accessories:nullableText,notes:nullableText,operating_hours:z.coerce.number().min(0).max(100000).optional(),area_hectares:z.coerce.number().min(0).max(100000).nullable().optional()}).strict().parse(req.body);
      if (body.returned_at>new Date()) throw new HttpError(422,'Actual return cannot be in the future.');
      if (['DAMAGED','UNSERVICEABLE'].includes(body.condition)&&!body.damage_description?.trim()) throw new HttpError(422,'Describe the equipment damage.');
      const returned=await withActor(db,req.actor.id,req.requestId,async tx=>{
        const inspection=await tx.equipmentInspection.create({data:{equipment_id:loan.equipment_id,borrowing_id:loan.id,inspector_id:req.actor.id,condition:body.condition,damage_description:body.damage_description,missing_accessories:body.missing_accessories,notes:body.notes,inspected_at:new Date()}});
        const returned=await tx.returnTransaction.create({data:{reference_code:code('RET'),borrowing_id:loan.id,inspection_id:inspection.id,received_by:req.actor.id,returned_at:body.returned_at,notes:body.notes}});
        const damaged=['DAMAGED','UNSERVICEABLE'].includes(body.condition)||Boolean(body.damage_description?.trim()||body.missing_accessories?.trim());
        if (damaged) {
          await tx.damageReport.create({data:{inspection_id:inspection.id,description:body.damage_description||body.missing_accessories||'Equipment damage requires assessment.',severity:body.condition==='UNSERVICEABLE'?'SEVERE':'MODERATE'}});
          await notifyStaff(tx,'maintenance.write','DAMAGED_EQUIPMENT',`Damaged equipment · ${loan.reference_code}`,loan.equipment_id,`damage:${inspection.id}`);
        }
        if (body.operating_hours!==undefined) {
          const usage=await tx.utilizationLog.create({data:{borrowing_id:loan.id,farm_reference:loan.farm_reference,operating_hours:body.operating_hours,area_hectares:body.area_hectares,activity:loan.purpose,recorded_by:req.actor.id}});
          await tx.integrationOutbox.create({data:{target_module:'APMS',event_type:'aeams.utilization.recorded.v1',aggregate_id:usage.id,idempotency_key:`usage:${usage.id}`,payload:{event_id:usage.id,equipment_id:loan.equipment_id,farm_reference:loan.farm_reference,operating_hours:String(body.operating_hours),occurred_at:new Date().toISOString()}}});
        }
        await notifyBorrower(tx,loan,'EQUIPMENT_RETURNED','Equipment return recorded',returned.reference_code,loan.id,`return:${returned.id}`);return returned;
      });result(res,returned);return;
    }
    const body=z.object({reason:text.optional(),condition:condition.optional()}).strict().parse(req.body||{});
    const needed=action==='release'?'borrowing.release':action==='cancel'?'borrowing.request':'borrowing.approve';
    if (!has(req.actor,needed)) throw new HttpError(403,'You do not have permission to process this borrowing.');
    if (action==='reject'&&!body.reason) throw new HttpError(422,'Provide a rejection reason.');
    if (action==='release' && (!body.condition || !['GOOD','FAIR','EXCELLENT'].includes(body.condition))) throw new HttpError(422,'A usable equipment condition is required before release.');
    if (action==='release' && (loan.starts_at>new Date() || loan.expected_return_at<=new Date())) throw new HttpError(409,'Equipment can be released only within its approved borrowing window.');
    const updated=await withActor(db,req.actor.id,req.requestId,async tx=>{
      const updated=await tx.borrowingTransaction.update({where:{id:loan.id},data:{status:action==='approve'?'APPROVED':action==='release'?'RELEASED':'CANCELLED',
        ...(action==='approve'?{approved_by:req.actor.id}:{}),...(action==='release'?{released_by:req.actor.id,released_at:new Date(),release_condition:body.condition}:{}),...(action==='reject'?{notes:`Rejected: ${body.reason}`}:{})}});
      await notifyBorrower(tx,loan,'BORROWING_STATUS',`Borrowing ${action==='reject'?'rejected':updated.status.toLowerCase()}`,body.reason||loan.reference_code,loan.id,`borrowing:${loan.id}:${updated.status}`);return updated;
    });result(res,updated);
  });

  app.get(`${base}/maintenance`,permit('maintenance.read'),async(req,res)=>{
    const q=page(req),status=z.enum(['SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED']).optional().parse(req.query.status);
    const where:Prisma.MaintenanceWorkOrderWhereInput={...(status?{status}:{}),...(q.search?{reference_code:{contains:q.search,mode:'insensitive'}}:{})};
    const [rows,total]=await Promise.all([db.maintenanceWorkOrder.findMany({where,include:{equipment:{select:{name:true,asset_code:true}},records:true},skip:q.skip,take:q.limit,orderBy:{created_at:q.sort}}),db.maintenanceWorkOrder.count({where})]);result(res,rows,total,q);
  });
  app.post(`${base}/maintenance`,permit('maintenance.write'),async(req,res)=>{
    const body=maintenanceBody.parse(req.body);
    if (body.ends_at<=body.starts_at) throw new HttpError(422,'Maintenance end must follow its start.');
    const technician=await db.user.findFirst({where:{id:body.assigned_to,active:true,archived_at:null,roles:{some:{role:{permissions:{some:{permission:{code:'maintenance.write'}}}}}}}});
    if (!technician) throw new HttpError(422,'Assign an active maintenance-authorized user.');
    if (body.schedule_id) {const schedule=one(await db.maintenanceSchedule.findUnique({where:{id:body.schedule_id}}));if (schedule.equipment_id!==body.equipment_id) throw new HttpError(422,'Maintenance schedule belongs to different equipment.');}
    const created=await withActor(db,req.actor.id,req.requestId,async tx=>{
      const r=await tx.maintenanceWorkOrder.create({data:{...body,reference_code:code('WO')}});
      await notify(tx,[body.assigned_to],'MAINTENANCE_ASSIGNED','Maintenance assigned',r.reference_code,r.id,`maintenance:${r.id}:assigned`);return r;
    });res.status(201);result(res,created);
  });
  app.post(`${base}/maintenance/:id/:action`,permit('maintenance.write'),async(req,res)=>{
    const action=z.enum(['start','complete','cancel']).parse(req.params.action);
    const work=one(await db.maintenanceWorkOrder.findUnique({where:{id:String(req.params.id)}}));
    const body=z.object({repair_notes:text.optional(),actual_cost:z.coerce.number().min(0).max(999999999).optional(),condition:condition.optional(),material_issue_reference:short.max(200).nullable().optional(),procurement_reference:short.max(200).nullable().optional()}).strict().parse(req.body||{});
    if (action==='start'&&work.starts_at>new Date()) throw new HttpError(409,'This scheduled work window has not started yet.');
    if (action==='complete'&&(!body.repair_notes||body.actual_cost===undefined||!body.condition)) throw new HttpError(422,'Completion requires repair notes, actual cost, and assessed condition.');
    const updated=await withActor(db,req.actor.id,req.requestId,async tx=>{
      if (action==='complete') await tx.maintenanceRecord.create({data:{work_order_id:work.id,technician_id:req.actor.id,repair_notes:body.repair_notes!,actual_cost:body.actual_cost!,material_issue_reference:body.material_issue_reference,procurement_reference:body.procurement_reference,performed_at:new Date()}});
      const r=await tx.maintenanceWorkOrder.update({where:{id:work.id},data:{status:action==='start'?'IN_PROGRESS':action==='complete'?'COMPLETED':'CANCELLED',...(action==='complete'?{completed_at:new Date()}:{} )}});
      if (action==='complete') {
        await tx.equipment.update({where:{id:work.equipment_id},data:{condition:body.condition}});
        if (work.schedule_id) {const schedule=one(await tx.maintenanceSchedule.findUnique({where:{id:work.schedule_id}}));await tx.maintenanceSchedule.update({where:{id:schedule.id},data:{next_due_at:new Date(Date.now()+schedule.interval_days*86400000)}});}
        await notifyStaff(tx,'maintenance.read','MAINTENANCE_COMPLETED',`Maintenance completed · ${work.reference_code}`,work.id,`maintenance:${work.id}:complete`);
      }
      return r;
    });result(res,updated);
  });
  app.get(`${base}/maintenance-schedules`,permit('maintenance.read'),async(_req,res)=>result(res,await db.maintenanceSchedule.findMany({include:{equipment:{select:{name:true,asset_code:true}}},orderBy:{next_due_at:'asc'}})));
  app.post(`${base}/maintenance-schedules`,permit('maintenance.write'),async(req,res)=>{
    const body=z.object({equipment_id:uuid,title:short,interval_days:z.coerce.number().int().min(1).max(3650),next_due_at:date}).strict().parse(req.body);
    res.status(201);result(res,await withActor(db,req.actor.id,req.requestId,tx=>tx.maintenanceSchedule.create({data:body})));
  });
  app.patch(`${base}/maintenance-schedules/:id`,permit('maintenance.write'),async(req,res)=>{
    const body=z.object({active:z.boolean().optional(),next_due_at:date.optional()}).strict().parse(req.body);
    result(res,await withActor(db,req.actor.id,req.requestId,tx=>tx.maintenanceSchedule.update({where:{id:String(req.params.id)},data:body})));
  });

  app.get(`${base}/farmers`,permit('farmer.read'),async(req,res)=>{const q=page(req),where={archived_at:null,display_name:{contains:q.search,mode:'insensitive' as const}};
    const [rows,total]=await Promise.all([db.farmerReference.findMany({where,skip:q.skip,take:q.limit,orderBy:{display_name:'asc'}}),db.farmerReference.count({where})]);result(res,rows,total,q);});
  app.post(`${base}/farmers/fallback`,permit('user.manage'),async(req,res)=>{
    const body=z.object({external_farmer_id:short.max(200),display_name:short,barangay_reference:short.max(200).optional(),reason:text,valid_until:date}).strict().parse(req.body);
    if (body.valid_until<=new Date()||body.valid_until.getTime()>Date.now()+90*86400000) throw new HttpError(422,'Fallback verification must expire within the next 90 days.');
    const {reason,...data}=body;res.status(201);result(res,await withActor(db,req.actor.id,req.requestId,tx=>tx.farmerReference.create({data:{...data,source:'LOCAL_FALLBACK',verified_at:new Date(),fallback_authorized_by:req.actor.id,fallback_reason:reason}})));
  });
  app.get(`${base}/users`,permit('user.manage'),async(req,res)=>{const q=page(req),active=z.enum(['true','false','all']).default('true').parse(req.query.active),where={display_name:{contains:q.search,mode:'insensitive' as const},...(active==='all'?{}:{active:active==='true'})};
    const [rows,total]=await Promise.all([db.user.findMany({where,select:userSelect,skip:q.skip,take:q.limit,orderBy:{created_at:q.sort}}),db.user.count({where})]);result(res,rows,total,q);});
  const userBody=z.object({email:z.string().email().max(254).transform(v=>v.toLowerCase().trim()),display_name:short,password:z.string().min(16).max(128),role_ids:z.array(uuid).length(1),active:z.boolean().default(true)}).strict();
  async function checkRoles(req:Request,ids:string[]) {
    const roles=await db.role.findMany({where:{id:{in:ids},code:{in:['ADMIN','EMPLOYEE']}}});
    if (roles.length!==new Set(ids).size) throw new HttpError(422,'One or more roles are invalid.');
    return roles;
  }
  app.post(`${base}/users`,permit('user.manage'),async(req,res)=>{
    const {password,role_ids,...body}=userBody.parse(req.body);const roles=await checkRoles(req,role_ids);
    const password_hash=await hash(password,12);
    const created=await withActor(db,req.actor.id,req.requestId,tx=>tx.user.create({data:{...body,password_hash,roles:{create:role_ids.map(role_id=>({role_id}))}},select:userSelect}));res.status(201);result(res,created);
  });
  app.patch(`${base}/users/:id`,permit('user.manage'),async(req,res)=>{
    const body=userBody.partial().parse(req.body),target=one(await db.user.findUnique({where:{id:String(req.params.id)},include:{roles:{include:{role:true}}}}));
    if (target.id===req.actor.id&&(body.active===false||body.role_ids)) throw new HttpError(422,'Another administrator must change your active status or roles.');
    const roles=body.role_ids?await checkRoles(req,body.role_ids):target.roles.map(r=>r.role);
    const {password,role_ids,...data}=body;
    const password_hash=password?await hash(password,12):undefined;
    const updated=await withActor(db,req.actor.id,req.requestId,async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(51007)::text`;
      if (target.roles.some(r=>r.role.code==='ADMIN') &&
          (data.active===false || !roles.some(r=>r.code==='ADMIN'))) {
        const remaining=await tx.user.count({where:{id:{not:target.id},active:true,archived_at:null,roles:{some:{role:{code:'ADMIN'}}}}});
        if (!remaining) throw new HttpError(409,'At least one active administrator must remain.');
      }
      if (role_ids) {await tx.userRole.deleteMany({where:{user_id:target.id}});await tx.userRole.createMany({data:role_ids.map(role_id=>({role_id,user_id:target.id}))});}
      return tx.user.update({where:{id:target.id},data:{...data,...(password_hash?{password_hash}:{}),auth_version:{increment:1}},select:userSelect});
    });result(res,updated);
  });

  app.get(`${base}/notifications`,async(req,res)=>{const q=page(req),where={user_id:req.actor.id};const [rows,total,unread]=await Promise.all([db.notification.findMany({where,skip:q.skip,take:q.limit,orderBy:{created_at:'desc'}}),db.notification.count({where}),db.notification.count({where:{...where,read_at:null}})]);res.json({data:rows,unread,pagination:{total,page:q.page,limit:q.limit,pages:Math.ceil(total/q.limit)}});});
  app.post(`${base}/notifications/:id/read`,async(req,res)=>{const changed=await db.notification.updateMany({where:{id:String(req.params.id),user_id:req.actor.id,read_at:null},data:{read_at:new Date()}});result(res,{updated:changed.count});});
  app.post(`${base}/notifications/read-all`,async(req,res)=>{await db.notification.updateMany({where:{user_id:req.actor.id,read_at:null},data:{read_at:new Date()}});result(res,{message:'Notifications marked as read.'});});
  app.post(`${base}/notifications/refresh`,permit('settings.manage'),async(_req,res)=>{await generateReminders(db);result(res,{message:'Return and maintenance reminders refreshed.'});});
  app.get(`${base}/audit-logs`,permit('audit.read'),async(req,res)=>{const q=page(req),where=q.search?{table_name:{contains:q.search,mode:'insensitive' as const}}:{};const [rows,total]=await Promise.all([db.auditLog.findMany({where,skip:q.skip,take:q.limit,orderBy:{created_at:'desc'}}),db.auditLog.count({where})]);result(res,rows,total,q);});
  app.get(`${base}/settings`,permit('equipment.read'),async(_req,res)=>result(res,(await db.systemSetting.findUnique({where:{key:'organization'}}))?.value));
  app.patch(`${base}/settings`,permit('settings.manage'),async(req,res)=>{const value=z.object({name:short,system_name:short,timezone:z.literal('Asia/Manila')}).strict().parse(req.body);result(res,await withActor(db,req.actor.id,req.requestId,tx=>tx.systemSetting.update({where:{key:'organization'},data:{value}})));});
  app.get(`${base}/integrations`,permit('integration.manage'),async(_req,res)=>{
    const connections=await db.integrationConnection.findMany({orderBy:{module:'asc'}});const outbox=await db.integrationOutbox.groupBy({by:['status'],_count:true});
    result(res,{connections:connections.map(c=>({...c,status:connectionStatus(c),contract:integrationContracts[c.module as keyof typeof integrationContracts]})),outbox});
  });
  app.patch(`${base}/integrations/:module`,permit('integration.manage'),async(req,res)=>{
    const module=z.enum(modules).parse(req.params.module);
    const body=z.object({mode:z.enum(['DISABLED','MOCK','LIVE']),base_url:z.string().url().max(500).nullable(),api_version:short.max(30),timeout_ms:z.coerce.number().int().min(100).max(10000),max_retries:z.coerce.number().int().min(0).max(2)}).strict().parse(req.body);
    if (body.mode==='LIVE'&&(!body.base_url||new URL(body.base_url).protocol!=='https:')) throw new HttpError(422,'Live connections require an HTTPS base URL.');
    if (body.base_url) {const url=new URL(body.base_url);if(url.username||url.password||url.search||url.hash) throw new HttpError(422,'Base URLs must not contain credentials, query parameters, or fragments. Configure module tokens on the backend.');}
    result(res,await withActor(db,req.actor.id,req.requestId,tx=>tx.integrationConnection.update({where:{module},data:{...body,secret_env_key:`${module}_API_TOKEN`,verified_at:null,last_success_at:null,last_error_code:null}})));
  });
  app.post(`${base}/integrations/:module/test`,permit('integration.manage'),async(req,res)=>{
    const module=z.enum(modules).parse(req.params.module),connection=one(await db.integrationConnection.findUnique({where:{module}}));
    try {const verification=await verifyConnection(connection);
      if (verification.verified) await withActor(db,req.actor.id,req.requestId,tx=>tx.integrationConnection.update({where:{module},data:{verified_at:new Date(),last_success_at:new Date(),last_error_code:null}}));result(res,verification);
    } catch(error) {await withActor(db,req.actor.id,req.requestId,tx=>tx.integrationConnection.update({where:{module},data:{verified_at:null,last_error_code:'CONNECTION_TEST_FAILED'}}));throw error;}
  });
  app.get(`${base}/dashboard`,permit('equipment.read'),async(req,res)=>{
    const [summary,status,monthly,maintenance,recentReservations,recentBorrowings,upcoming,maintenanceAlerts]=await Promise.all([
      db.$queryRaw`SELECT * FROM aeams.dashboard_summary`,db.$queryRaw`SELECT availability AS name,count(*)::int AS value FROM aeams.equipment_availability WHERE archived_at IS NULL GROUP BY availability`,
      db.$queryRaw`SELECT to_char(m,'Mon') AS month,count(b.id)::int AS borrowings FROM generate_series(date_trunc('month',now())-interval '5 months',date_trunc('month',now()),interval '1 month') m LEFT JOIN aeams.borrowing_transactions b ON date_trunc('month',b.released_at)=m GROUP BY m ORDER BY m`,
      db.maintenanceWorkOrder.groupBy({by:['status'],_count:true}),db.reservation.findMany({include:{equipment:{select:{name:true}},farmer:{select:{display_name:true}}},take:5,orderBy:{created_at:'desc'}}),
      db.borrowingTransaction.findMany({include:{equipment:{select:{name:true}},farmer:{select:{display_name:true}}},take:5,orderBy:{created_at:'desc'}}),
      db.borrowingTransaction.findMany({where:{status:{in:['RELEASED','OVERDUE']}},include:{equipment:{select:{name:true}}},take:5,orderBy:{expected_return_at:'asc'}}),
      db.maintenanceWorkOrder.findMany({where:{status:{in:['SCHEDULED','IN_PROGRESS']}},include:{equipment:{select:{name:true}}},take:5,orderBy:{starts_at:'asc'}})]);
    result(res,{summary:(summary as unknown[])[0],status,monthly,maintenance,recentReservations,recentBorrowings,upcoming,maintenanceAlerts,utilization:await utilization(db,{})});
  });
  app.get(`${base}/utilization`,permit('report.read'),async(req,res)=>result(res,await utilization(db,req.query)));
  registerReports(app,db);
}
