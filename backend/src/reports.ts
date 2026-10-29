import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { HttpError,one,permit,result,uuid } from './http.js';

const filters=z.object({from:z.coerce.date().optional(),to:z.coerce.date().optional(),category_id:uuid.optional(),status:z.string().max(30).optional()});
export async function utilization(db:PrismaClient,query:unknown) {
  const input=filters.parse(query),end=input.to||new Date(),start=input.from||new Date(end.getTime()-30*86400000);
  if (end<=start||end.getTime()-start.getTime()>366*5*86400000||end.getTime()>Date.now()+60000) throw new HttpError(422,'Choose a past utilization window of at most five years with end after start.');
  const rows=await db.$queryRawUnsafe<Record<string,unknown>[]>(`
    SELECT e.id AS equipment_id,e.asset_code,e.name,e.category_id,
      (SELECT count(*)::int FROM aeams.borrowing_transactions b LEFT JOIN aeams.return_transactions r ON r.borrowing_id=b.id
       WHERE b.equipment_id=e.id AND b.released_at IS NOT NULL AND b.released_at<$2 AND coalesce(r.returned_at,now())>$1) AS borrowing_count,
      round(coalesce((SELECT sum(extract(epoch FROM (least(coalesce(r.returned_at,now()),$2)-greatest(b.released_at,$1)))/3600)
       FROM aeams.borrowing_transactions b LEFT JOIN aeams.return_transactions r ON r.borrowing_id=b.id WHERE b.equipment_id=e.id
       AND b.released_at<$2 AND coalesce(r.returned_at,now())>$1),0)::numeric,2) AS borrowed_hours,
      round(coalesce((SELECT sum(extract(epoch FROM (least(coalesce(w.completed_at,now()),$2)-greatest(w.starts_at,$1)))/3600)
       FROM aeams.maintenance_work_orders w WHERE w.equipment_id=e.id AND w.status IN ('IN_PROGRESS','COMPLETED')
       AND w.starts_at<$2 AND coalesce(w.completed_at,now())>$1),0)::numeric,2) AS maintenance_hours,
      round(coalesce((SELECT sum(u.operating_hours) FROM aeams.utilization_logs u JOIN aeams.borrowing_transactions b ON b.id=u.borrowing_id
       JOIN aeams.return_transactions r ON r.borrowing_id=b.id WHERE b.equipment_id=e.id AND r.returned_at >= $1 AND r.returned_at <= $2),0)::numeric,2) AS logged_operating_hours,
      greatest(extract(epoch FROM ($2::timestamptz-greatest($1::timestamptz,coalesce(e.acquisition_date::timestamptz,$1::timestamptz))))/3600,0)::numeric AS period_hours
    FROM aeams.equipment e WHERE e.archived_at IS NULL AND ($3::uuid IS NULL OR e.category_id=$3::uuid) ORDER BY e.name`,start,end,input.category_id||null);
  return {from:start,to:end,rows:rows.map(row=>({...row,utilization_percentage:Number(row.period_hours)>0?Math.min(100,Number((100*Number(row.borrowed_hours)/Number(row.period_hours)).toFixed(2))):0,total_borrowed_days:Number((Number(row.borrowed_hours)/24).toFixed(2))}))};
}
const reportQueries={
  inventory:`SELECT e.asset_code,e.name,c.name AS category,l.name AS location,e.condition AS status,e.acquisition_cost,e.acquisition_date,e.created_at AS occurred_at,e.category_id FROM aeams.equipment e JOIN aeams.equipment_categories c ON c.id=e.category_id JOIN aeams.equipment_locations l ON l.id=e.location_id WHERE e.archived_at IS NULL`,
  availability:`SELECT e.asset_code,e.name,c.name AS category,v.availability AS status,e.created_at AS occurred_at,e.category_id FROM aeams.equipment e JOIN aeams.equipment_availability v ON v.id=e.id JOIN aeams.equipment_categories c ON c.id=e.category_id WHERE e.archived_at IS NULL`,
  conditions:`SELECT e.asset_code,e.name,c.name AS category,e.condition AS status,e.updated_at AS occurred_at,e.category_id FROM aeams.equipment e JOIN aeams.equipment_categories c ON c.id=e.category_id WHERE e.archived_at IS NULL`,
  borrowings:`SELECT b.reference_code,e.asset_code,e.name,f.display_name AS borrower,b.status,b.starts_at,b.expected_return_at,b.released_at,b.created_at AS occurred_at,e.category_id FROM aeams.borrowing_transactions b JOIN aeams.equipment e ON e.id=b.equipment_id JOIN aeams.farmer_references f ON f.id=b.farmer_id`,
  returns:`SELECT r.reference_code,e.asset_code,e.name,f.display_name AS borrower,i.condition AS status,r.returned_at AS occurred_at,i.damage_description,i.missing_accessories,e.category_id FROM aeams.return_transactions r JOIN aeams.borrowing_transactions b ON b.id=r.borrowing_id JOIN aeams.equipment e ON e.id=b.equipment_id JOIN aeams.farmer_references f ON f.id=b.farmer_id JOIN aeams.equipment_inspections i ON i.id=r.inspection_id`,
  overdue:`SELECT b.reference_code,e.asset_code,e.name,f.display_name AS borrower,'OVERDUE'::text AS status,b.expected_return_at AS occurred_at,e.category_id FROM aeams.overdue_borrowings b JOIN aeams.equipment e ON e.id=b.equipment_id JOIN aeams.farmer_references f ON f.id=b.farmer_id`,
  maintenance:`SELECT w.reference_code,e.asset_code,e.name,w.type,w.status,w.starts_at AS occurred_at,w.completed_at,w.estimated_cost,coalesce((SELECT sum(actual_cost) FROM aeams.maintenance_records m WHERE m.work_order_id=w.id),0) AS actual_cost,e.category_id FROM aeams.maintenance_work_orders w JOIN aeams.equipment e ON e.id=w.equipment_id`
};
const reportName=z.enum(['inventory','availability','conditions','borrowings','returns','overdue','maintenance','utilization']);
const pretty=(value:unknown):string=>value instanceof Date?value.toLocaleString('en-PH',{timeZone:'Asia/Manila'}):value===null||value===undefined?'—':String(value);
function pdf(res:import('express').Response,title:string,rows:Record<string,unknown>[],organization='Bongabong Municipal Agriculture Office') {
  res.type('application/pdf').setHeader('Content-Disposition',`inline; filename="aeams-${title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.pdf"`);
  const document=new PDFDocument({size:'A4',margin:40,bufferPages:true});document.pipe(res);
  document.fillColor('#166534').fontSize(16).text('Agricultural Equipment and Asset Management System');
  document.fillColor('#0f172a').fontSize(11).text(organization).moveDown();
  document.fontSize(16).text(title).fontSize(9).fillColor('#64748b').text(`Generated ${new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'})} · Asia/Manila`).moveDown();
  if (!rows.length) document.text('No records match this report.');
  for (const [index,row] of rows.entries()) {
    const text=Object.entries(row).map(([key,value])=>`${key.replaceAll('_',' ')}: ${pretty(value)}`).join('  |  ');
    const height=document.heightOfString(text,{width:510});if (document.y+height+35>780) document.addPage();
    document.fillColor('#166534').fontSize(10).text(`Record ${index+1}`).fillColor('#0f172a').fontSize(9).text(text,{width:510}).moveDown();
  }
  const range=document.bufferedPageRange();for (let i=range.start;i<range.start+range.count;i++) {document.switchToPage(i);document.fontSize(8).fillColor('#64748b').text(`AEAMS · Page ${i+1} of ${range.count}`,40,800,{lineBreak:false});}
  document.end();
}
export function registerReports(app:Express,db:PrismaClient) {
  app.get('/api/v1/reports/:report',permit('report.read'),async(req,res)=>{
    const name=reportName.parse(req.params.report),query=filters.parse(req.query),format=z.enum(['json','csv','pdf']).default('json').parse(req.query.format);
    if (query.from&&query.to&&query.from>=query.to) throw new HttpError(422,'Report end must follow start.');
    let rows:Record<string,unknown>[];
    if (name==='utilization') rows=(await utilization(db,query)).rows;
    else rows=await db.$queryRawUnsafe(`SELECT * FROM (${reportQueries[name]}) r WHERE ($1::timestamptz IS NULL OR occurred_at >= $1)
      AND ($2::timestamptz IS NULL OR occurred_at <= $2) AND ($3::uuid IS NULL OR category_id=$3::uuid) AND ($4::text IS NULL OR status=$4) ORDER BY occurred_at DESC LIMIT 5001`,query.from||null,query.to||null,query.category_id||null,query.status||null);
    if (rows.length>5000) throw new HttpError(422,'This report exceeds 5,000 rows. Narrow the date or category filters.');
    rows=rows.map(({category_id:_,...row})=>row);
    if (format==='json') {result(res,rows);return;}
    if (format==='csv') {
      const headers=rows.length?Object.keys(rows[0]):['message'];
      const cell=(v:unknown)=>`"${pretty(v).replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')}"`;
      res.type('text/csv').setHeader('Content-Disposition',`attachment; filename="aeams-${name}.csv"`);
      res.send('\uFEFF'+[headers.map(cell).join(','),...rows.map(row=>headers.map(h=>cell(row[h])).join(','))].join('\r\n'));return;
    }
    const organization=(await db.systemSetting.findUnique({where:{key:'organization'}}))?.value as {name?:string}|null;
    pdf(res,`${name[0].toUpperCase()+name.slice(1)} report`,rows,organization?.name);
  });
  app.get('/api/v1/borrowings/:id/receipt',permit('equipment.read'),async(req,res)=>{
    const loan=one(await db.borrowingTransaction.findUnique({where:{id:String(req.params.id)},include:{equipment:true,farmer:true,return_transaction:{include:{inspection:true}}}}));
    const returned=req.query.type==='return';
    if (returned&&!loan.return_transaction) throw new HttpError(409,'No return has been recorded.');
    const row:Record<string,unknown>={transaction:loan.reference_code,equipment:loan.equipment.name,asset_code:loan.equipment.asset_code,borrower:loan.farmer.display_name,farmer_reference:loan.farmer.external_farmer_id,purpose:loan.purpose,expected_return:loan.expected_return_at,status:loan.status,
      ...(returned?{receipt:loan.return_transaction!.reference_code,returned_at:loan.return_transaction!.returned_at,inspected_condition:loan.return_transaction!.inspection.condition,damage:loan.return_transaction!.inspection.damage_description,missing_accessories:loan.return_transaction!.inspection.missing_accessories}:{released_at:loan.released_at,release_condition:loan.release_condition})};
    if (req.query.format==='json') {result(res,row);return;}
    pdf(res,returned?'Equipment return receipt':'Equipment borrowing receipt',[row]);
  });
}
