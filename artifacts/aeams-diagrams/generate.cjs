const fs=require('node:fs/promises');
const path=require('node:path');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..');
const requireTools=createRequire(path.join(root,'.test-data/diagram-tools/package.json'));
const {instance}=requireTools('@viz-js/viz');
const W=requireTools('docx');
const {chromium}=require(path.join(root,'node_modules/@playwright/test'));
const title='Agricultural Equipment and Asset Management System';
const description='A system developed to manage agricultural machinery, equipment, and other municipal agricultural assets. It supports equipment reservations, borrowing and return transactions, maintenance scheduling, equipment availability monitoring, and asset utilization tracking to improve operational efficiency.';
const C={green:'#166534',teal:'#0F766E',ink:'#153E35',line:'#477D70',soft:'#EAF5EF',pale:'#F0FDFA',muted:'#52685F',gold:'#FEF3C7',purple:'#F0EBFA'};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const q=s=>JSON.stringify(String(s));
const node=(id,label,opts='')=>`${id} [label=${q(label)} ${opts}];`;
const arrow=(from,to,label='',opts='')=>`${from} -> ${to} [label=${q(label)} ${opts}];`;
const entity=(id,name,fields,stereotype='')=>`${id} [shape=plain label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="7" COLOR="${C.line}"><TR><TD BGCOLOR="${C.green}"><FONT COLOR="white"><B>${stereotype?esc(stereotype)+'<BR/>':''}${esc(name)}</B></FONT></TD></TR><TR><TD BGCOLOR="${C.soft}" ALIGN="LEFT"><FONT POINT-SIZE="14">${fields.map(esc).join('<BR ALIGN="LEFT"/>')}<BR ALIGN="LEFT"/></FONT></TD></TR></TABLE>>];`;
function graph(body,dir='LR',extra=''){
 return `digraph AEAMS { graph [rankdir=${dir},bgcolor="white",pad="0.25",nodesep="0.38",ranksep="0.65",splines=polyline,fontname="Arial",fontsize=16,fontcolor="${C.ink}",${extra}]; node [shape=box,style="rounded,filled",fillcolor="${C.soft}",color="${C.line}",fontcolor="${C.ink}",fontname="Arial",fontsize=16,penwidth=1.5,margin="0.18,0.12"]; edge [fontname="Arial",fontsize=14,color="${C.line}",fontcolor="${C.muted}",penwidth=1.4,arrowsize=0.75]; ${body} }`;
}
const cluster=(id,label,...bodies)=>`subgraph cluster_${id} { label=${q(label)}; style="rounded,filled"; fillcolor="${C.pale}"; color="${C.teal}"; penwidth=1.4; margin=20; ${bodies.flat().join('\n')} }`;
const d=[];
const add=(name,caption,body,dir='LR',extra='')=>d.push({name,caption,dot:graph(body,dir,extra)});

add('System Architecture','The implemented React → Nginx → Express → Prisma → PostgreSQL stack. Farmers are borrower references, not portal users.',[
 node('admin','Admin',`fillcolor="${C.gold}"`),node('employee','Employee',`fillcolor="${C.gold}"`),
 cluster('presentation','Presentation',node('ui','React + TypeScript\nBrowser interface')+node('nginx','Nginx\nStatic files + API proxy')+'{rank=same;ui;nginx;}'),
 cluster('application','Application services',node('auth','JWT cookie authentication\nAdmin / Employee permissions')+node('api','Express API\nEquipment and transaction workflows')+node('jobs','Reminder scheduler\nNotifications and overdue checks')+node('reports','CSV / PDF reports\nAvailability and utilization')+'{rank=same;auth;api;}{rank=same;jobs;reports;}'),
 cluster('storage','Persistence',node('prisma','Prisma\nRestricted runtime database login')+node('db','Centralized PostgreSQL\naeams schema','shape=cylinder')+node('photos','Equipment photograph volume','shape=folder')+'{rank=same;prisma;db;photos;}'),
 arrow('admin','ui'),arrow('employee','ui'),arrow('ui','nginx','same-origin requests'),arrow('nginx','auth','/api/v1'),arrow('auth','api','authorized request'),arrow('api','prisma'),arrow('jobs','prisma'),arrow('reports','prisma'),arrow('api','jobs','events'),arrow('api','reports'),arrow('prisma','db'),arrow('api','photos','authenticated file access')
].join('\n'),'TB');

add('Class Diagram','Conceptual domain model aligned with the implemented records. User roles are Admin or Employee; workflow operations are responsibilities, not literal ORM methods.',[
 entity('user','User',['id: UUID','email: string','active: boolean'],'«entity»'),entity('role','Role',['code: ADMIN | EMPLOYEE'],'«entity»'),
 entity('gear','Equipment',['id: UUID','asset_code: string','condition: string'],'«entity»'),entity('farmer','FarmerReference',['id: UUID','display_name: string','valid_until: datetime'],'«entity»'),
 entity('res','Reservation',['id: UUID','starts_at / ends_at','status: string'],'«entity»'),entity('loan','BorrowingTransaction',['id: UUID','expected_return_at','status: string'],'«entity»'),
 entity('inspection','EquipmentInspection',['id: UUID','condition: string','inspected_at: datetime'],'«entity»'),entity('ret','ReturnTransaction',['id: UUID','returned_at: datetime'],'«entity»'),
 entity('work','MaintenanceWorkOrder',['id: UUID','assigned_to: UUID?','status: string'],'«entity»'),entity('usage','UtilizationLog',['borrowing_id: UUID','operating_hours: decimal'],'«entity»'),
 arrow('user','role','one role / account','arrowhead=none taillabel="0..*" headlabel="1"'),arrow('gear','res','','arrowhead=none taillabel="1" headlabel="0..*"'),arrow('farmer','res','','arrowhead=none taillabel="1" headlabel="0..*"'),arrow('gear','loan','','arrowhead=none taillabel="1" headlabel="0..*"'),arrow('farmer','loan','','arrowhead=none taillabel="1" headlabel="0..*"'),arrow('res','loan','optional handoff','arrowhead=none taillabel="0..1" headlabel="0..1"'),arrow('loan','inspection','','arrowhead=none taillabel="1" headlabel="0..*"'),arrow('loan','ret','','arrowhead=none taillabel="1" headlabel="0..1"'),arrow('inspection','ret','','arrowhead=none taillabel="1" headlabel="0..1"'),arrow('gear','work','','arrowhead=none taillabel="1" headlabel="0..*"'),arrow('loan','usage','','arrowhead=none taillabel="1" headlabel="0..1"'),arrow('user','work','assigned personnel','style=dashed arrowhead=none')
].join('\n'),'TB');

add('Component Diagram','Logical components and their dependencies. Database constraints enforce conflicts and evidence requirements in addition to API validation.',[
 node('client','«component»\nReact frontend'),node('proxy','«component»\nNginx web / API gateway'),node('auth','«component»\nAuthentication + authorization'),node('equipment','«component»\nEquipment inventory + photos'),node('transactions','«component»\nReservations + borrowing + returns'),node('maintenance','«component»\nMaintenance management'),node('analytics','«component»\nReports + utilization'),node('reminders','«component»\nNotification scheduler'),node('data','«component»\nPrisma persistence'),node('db','«database»\nPostgreSQL constraints + audit','shape=cylinder'),
 arrow('client','proxy'),arrow('proxy','auth'),...['equipment','transactions','maintenance','analytics','reminders'].map(x=>arrow('auth',x)),...['equipment','transactions','maintenance','analytics','reminders'].map(x=>arrow(x,'data','uses','style=dashed')),arrow('data','db')
].join('\n'));

add('Deployment Diagram','Current local Docker deployment, with the configured HTTPS gateway shown as a production option. Database/photo volumes persist across container replacement.',[
 node('browser','«device»\nAdmin / Employee browser'),
 cluster('docker','Docker host',
 node('web','«container»\nNginx + React build\nlocalhost:3002 → :80')+node('api','«container»\nNode.js / Express\nlocalhost:5000 → :5000')+node('db','«container»\nPostgreSQL\nlocalhost:5432 → :5432','shape=cylinder')+node('migration','«one-shot container»\nPrisma migrations + reference setup')+node('data','«volume»\nPostgreSQL data','shape=folder')+node('photos','«volume»\nEquipment uploads','shape=folder')+node('https','«optional production container»\nCaddy / HTTPS :443',`style="rounded,dashed,filled" fillcolor="${C.gold}"`)+arrow('web','api','Docker network /api')+arrow('api','db','restricted database login')+arrow('migration','db','deployment login')+arrow('db','data')+arrow('api','photos')+arrow('https','web','production path','style=dashed')),
 arrow('browser','web','local HTTP'),arrow('browser','https','HTTPS when deployed','style=dashed')
].join('\n'));

add('Object Diagram','Fictional snapshot after a good inspected return. Object values illustrate valid relationships and are not personal or live municipal records.',[
 entity('a','adminA : User',['role = ADMIN','active = true']),entity('e','employeeB : User',['role = EMPLOYEE','active = true']),entity('g','tractor01 : Equipment',['asset_code = EQ-001','condition = GOOD']),entity('f','reference01 : FarmerReference',['display_name = Sample Borrower','verification = current']),entity('b','loan01 : BorrowingTransaction',['reference_code = BOR-SAMPLE-01','status = RETURNED']),entity('i','inspection01 : EquipmentInspection',['condition = GOOD','missing_accessories = none']),entity('r','return01 : ReturnTransaction',['reference_code = RET-SAMPLE-01']),entity('u','usage01 : UtilizationLog',['operating_hours = 2.50']),
 arrow('a','b','approved_by','arrowhead=none'),arrow('e','b','requested_by','arrowhead=none'),arrow('g','b','equipment','arrowhead=none'),arrow('f','b','borrower reference','arrowhead=none'),arrow('b','i','inspection','arrowhead=none'),arrow('b','r','return','arrowhead=none'),arrow('i','r','inspection evidence','arrowhead=none'),arrow('b','u','usage','arrowhead=none')
].join('\n'),'TB');

add('Package Diagram','Logical organization of the implemented frontend, API and persistence responsibilities; package names express design groupings.',[
 cluster('front','Frontend',node('pages','«package»\nPages + UI components')+node('client','«package»\nAuth context + API client')),
 cluster('back','Backend',node('security','«package»\nAuthentication / permissions')+node('routes','«package»\nOperational API routes')+node('report','«package»\nReports / utilization')+node('notify','«package»\nNotifications')+node('integration','«package»\nIntegration configuration\nLive contracts pending')),
 cluster('persist','Persistence',node('prisma','«package»\nPrisma model + migrations')+node('sql','«package»\nPostgreSQL rules + audit')),
 arrow('pages','client','«uses»','style=dashed'),arrow('client','security','HTTP API','style=dashed'),arrow('security','routes','«uses»','style=dashed'),arrow('routes','report','«uses»','style=dashed'),arrow('routes','notify','«uses»','style=dashed'),arrow('routes','integration','«uses»','style=dashed'),...['routes','report','notify','integration'].map(x=>arrow(x,'prisma','«uses»','style=dashed')),arrow('prisma','sql','«depends on»','style=dashed')
].join('\n'));

add('Composite Structure Diagram','Internal parts of a borrowing-approval request. A booking conflict rolls back the transaction; notifications and audit evidence commit with the change.',[
 node('admin','Admin'),cluster('api','«structured component» Borrowing approval API',node('port','HTTP port\nPOST /borrowings/{id}/approve')+node('auth','auth : SessionVerifier')+node('permissions','policy : PermissionCheck')+node('handler','workflow : ApprovalHandler')+node('tx','tx : DatabaseTransaction')+node('rules','rules : ConflictAndVerificationChecks')+node('notify','events : NotificationsAndAudit')+arrow('port','auth')+arrow('auth','permissions')+arrow('permissions','handler','borrowing.approve')+arrow('handler','tx')+arrow('tx','rules')+arrow('rules','notify','only if valid')),
 node('db','PostgreSQL','shape=cylinder'),arrow('admin','port','request'),arrow('tx','db','transaction connection'),arrow('notify','db','same transaction')
].join('\n'));

add('Profile Diagram','Proposed UML modeling conventions for this documentation. These stereotypes are design annotations, not an installed runtime framework or additional user roles.',[
 cluster('profile','«profile» AEAMS modeling conventions',entity('asset','«stereotype» MunicipalAsset',['assetCode: String','condition: String']),entity('transaction','«stereotype» AuditedTransaction',['referenceCode: String','actorId: UUID']),entity('review','«stereotype» AdminApproval',['permission: borrowing.approve','approvalEvidence: required']),entity('service','«stereotype» PermissionControlledService',['roles: ADMIN, EMPLOYEE'])),
 node('class','«metaclass»\nClass',`fillcolor="${C.purple}"`),node('activity','«metaclass»\nActivity',`fillcolor="${C.purple}"`),node('component','«metaclass»\nComponent',`fillcolor="${C.purple}"`),arrow('asset','class','«extension»','arrowhead=normal'),arrow('transaction','class','«extension»','arrowhead=normal'),arrow('review','activity','«extension»','arrowhead=normal'),arrow('service','component','«extension»','arrowhead=normal')
].join('\n'),'TB');

add('Data Flow Diagram','Level 1 DFD: rectangles are external staff, circles are processes, cylinders are logical stores. Process labels map to actual AEAMS responsibilities.',[
 node('staff','Admin / Employee',`fillcolor="${C.gold}"`),node('admin','Admin',`fillcolor="${C.gold}"`),
 node('p1','1.0\nAuthenticate','shape=ellipse'),node('p2','2.0\nManage inventory','shape=ellipse'),node('p3','3.0\nRequest + approve\nbookings','shape=ellipse'),node('p4','4.0\nRelease + inspect\nreturns','shape=ellipse'),node('p5','5.0\nManage\nmaintenance','shape=ellipse'),node('p6','6.0\nGenerate reports\n+ reminders','shape=ellipse'),
 ...[['users','D1 Users / roles'],['gear','D2 Equipment / photos'],['refs','D3 Farmer references'],['loans','D4 Reservations / borrowing / returns'],['work','D5 Maintenance records'],['logs','D6 Utilization / notifications / audit']].map(([id,label])=>node(id,label,'shape=cylinder')),
 arrow('staff','p1','credentials'),arrow('p1','users','account lookup'),arrow('p1','staff','authenticated session'),arrow('staff','p2','asset details'),arrow('p2','gear','asset records'),arrow('staff','p3','requested dates + borrower'),arrow('admin','p3','approval / rejection'),arrow('refs','p3','verification'),arrow('gear','p3','condition + availability'),arrow('p3','loans','booking records'),arrow('staff','p4','release / return inspection'),arrow('loans','p4','approved / active borrowing'),arrow('p4','loans','transaction evidence'),arrow('p4','gear','condition update'),arrow('staff','p5','work details'),arrow('p5','work','work records'),arrow('work','p6','cost / downtime'),arrow('loans','p6','transaction history'),arrow('p4','logs','usage + alerts'),arrow('p6','staff','reports + reminders'),arrow('p6','logs','deduplicated notifications')
].join('\n'));

add('Use Case Diagram','Exactly two portal actors. Admin manages approvals and administration; both roles carry out permitted equipment operations. Farmers remain external borrower references.',[
 node('employee','«actor»\nEmployee',`fillcolor="${C.gold}"`),node('admin','«actor»\nAdmin',`fillcolor="${C.gold}"`),cluster('aeams','AEAMS system boundary',
 ...[['login','Sign in / sign out'],['inventory','Manage equipment\nand monitor availability'],['request','Request reservations\nand borrowing'],['return','Release equipment\nand record inspected returns'],['maint','Schedule and process\nmaintenance'],['report','View reports, utilization\nand notifications'],['approve','Approve / reject requests'],['users','Manage Admin / Employee accounts'],['settings','Manage settings, integrations\nand review audit history']].map(([id,label])=>node(id,label,'shape=ellipse'))),
 ...['login','inventory','request','return','maint','report'].flatMap(id=>[arrow('employee',id,'','arrowhead=none'),arrow('admin',id,'','arrowhead=none')]),...['approve','users','settings'].map(id=>arrow('admin',id,'','arrowhead=none'))
].join('\n'),'LR','concentrate=true');

add('Activity Diagram','End-to-end operational workflow. The Admin decides approval; permitted staff release and inspect the return. Damage flags the asset unavailable and alerts maintenance.',[
 node('start','','shape=circle width=0.18 height=0.18 style=filled fillcolor="#166534"'),node('request','Employee / Admin submits\nborrowing request'),node('valid','Farmer verification +\nequipment checks pass?','shape=diamond'),node('fix','Correct request\nor select another asset'),node('review','Admin reviews request'),node('approved','Approve?','shape=diamond'),node('cancel','Cancel with rejection reason'),node('release','Staff inspect and release\nwithin approved borrowing window'),node('use','Borrower uses equipment'),node('inspect','Staff record inspected return\n+ optional utilization'),node('good','Usable condition?','shape=diamond'),node('available','Close borrowing;\nrefresh equipment availability'),node('flag','Close borrowing; flag unavailable\n+ damage / maintenance alert'),node('maint','Staff schedule, start and\ncomplete maintenance assessment'),node('end','','shape=doublecircle width=0.22 height=0.22 style=filled fillcolor="#166534"'),
 arrow('start','request'),arrow('request','valid'),arrow('valid','fix','No'),arrow('fix','request'),arrow('valid','review','Yes'),arrow('review','approved'),arrow('approved','cancel','No'),arrow('cancel','end'),arrow('approved','release','Yes'),arrow('release','use'),arrow('use','inspect'),arrow('inspect','good'),arrow('good','available','Yes'),arrow('good','flag','No'),arrow('flag','maint'),arrow('maint','end'),arrow('available','end')
].join('\n'),'TB');

function svgShell(content,w=1440,h=800){return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9" fill="${C.teal}"/></marker></defs><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" fill="${C.ink}">${content}</g></svg>`;}
const text=(x,y,label,size=18,anchor='middle',color=C.ink)=>`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${color}">${esc(label)}</text>`;
const box=(x,y,w,h,label)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${C.soft}" stroke="${C.line}" stroke-width="2"/>${text(x+w/2,y+h/2+6,label)}`;
const message=(x1,x2,y,label,dashed=false)=>`<path d="M${x1} ${y}H${x2}" stroke="${C.teal}" stroke-width="2" fill="none" ${dashed?'stroke-dasharray="7 5"':''} marker-end="url(#arrow)"/>${text((x1+x2)/2,y-12,label,16)}`;
const xs=[110,410,710,1010,1310];
let sequence=['Admin','React UI','Express API','Prisma','PostgreSQL'].map((name,i)=>box(xs[i]-92,18,184,54,name)+`<path d="M${xs[i]} 72V760" stroke="${C.line}" stroke-dasharray="7 6"/>`).join('');
sequence+=message(xs[0],xs[1],120,'1  Review requested borrowing');
sequence+=message(xs[1],xs[2],190,'2  POST /borrowings/{id}/approve');
sequence+=`<rect x="555" y="210" width="825" height="490" fill="none" stroke="${C.teal}" stroke-dasharray="7 4"/><rect x="555" y="210" width="220" height="30" fill="${C.pale}" stroke="${C.teal}"/>${text(565,231,'alt [authorized + valid]',16,'start')}`;
sequence+=message(xs[2],xs[3],280,'3  Begin actor-scoped transaction');
sequence+=message(xs[3],xs[4],350,'4  Approve + enforce booking rules');
sequence+=message(xs[4],xs[3],420,'5  Commit approval + audit + notification',true);
sequence+=message(xs[3],xs[2],490,'6  Approved record',true);
sequence+=message(xs[2],xs[1],560,'7  200 response',true)+message(xs[1],xs[0],630,'8  Display approved status',true);
sequence+=`<path d="M555 655H1380" stroke="${C.teal}" stroke-dasharray="7 4"/>${text(570,681,'[invalid / conflict] Roll back; respond 422 / 409',16,'start')}`;
d.push({name:'Sequence Diagram',caption:'Borrowing approval sequence. Authentication and permission checks precede the database transaction; constraint failures roll back instead of committing partial approvals.',svg:svgShell(sequence)});

add('State Machine Diagram','Canonical BorrowingTransaction status values from the database. UI labels may show Requested as Pending and Released as Borrowed. Rejection is stored as CANCELLED with a reason.',[
 node('start','','shape=circle width=0.16 height=0.16 fillcolor="#166534"'),...['REQUESTED','APPROVED','RELEASED','OVERDUE','RETURNED','CANCELLED'].map(x=>node(x,x,x==='OVERDUE'?`fillcolor="${C.gold}"`:'')),node('end','','shape=doublecircle width=0.2 height=0.2 fillcolor="#166534"'),
 arrow('start','REQUESTED','create request'),arrow('REQUESTED','APPROVED','Admin approves [valid reference + no conflict]'),arrow('REQUESTED','CANCELLED','cancel / reject with reason'),arrow('APPROVED','CANCELLED','cancel before release'),arrow('APPROVED','RELEASED','staff release [inspection + valid window]'),arrow('RELEASED','OVERDUE','expected return time has passed'),arrow('RELEASED','RETURNED','record inspected return'),arrow('OVERDUE','RETURNED','record inspected return'),arrow('RETURNED','end'),arrow('CANCELLED','end')
].join('\n'));

add('Communication Diagram','Numbered messages for a borrowing approval. The notification and audit records are written inside the same transaction as the approved borrowing.',[
 node('admin','admin : Admin'),node('ui','web : ReactUI'),node('api','api : ExpressService'),node('policy','policy : Authorization'),node('prisma','tx : PrismaTransaction'),node('db','store : PostgreSQL','shape=cylinder'),
 arrow('admin','ui','1: select request / approve'),arrow('ui','api','2: POST approval'),arrow('api','policy','3: verify session + permission'),arrow('api','prisma','4: begin transaction'),arrow('prisma','db','5: update + validate booking'),arrow('prisma','db','6: insert notification + audit'),arrow('db','prisma','7: commit','style=dashed'),arrow('api','ui','8: approved response','style=dashed'),arrow('ui','admin','9: display status','style=dashed')
].join('\n'));

add('Interaction Overview Diagram','High-level orchestration of the system interactions. Each ref node represents a separate user/API interaction, not an additional deployed service.',[
 node('start','','shape=circle width=0.16 height=0.16 fillcolor="#166534"'),node('login','ref  Sign in and load permissions'),node('catalog','ref  View equipment / availability'),node('request','ref  Submit reservation or borrowing'),node('approval','ref  Admin reviews and approves'),node('ok','Approved?','shape=diamond'),node('revise','ref  Review rejection / revise request'),node('handoff','ref  Create / approve linked borrowing\n(if starting from a reservation)'),node('release','ref  Inspect and release equipment'),node('return','ref  Record inspected return + usage'),node('service','Maintenance\nneeded?','shape=diamond'),node('work','ref  Schedule / process maintenance'),node('reports','ref  View reports and notifications'),node('end','','shape=doublecircle width=0.2 height=0.2 fillcolor="#166534"'),
 arrow('start','login'),arrow('login','catalog'),arrow('catalog','request'),arrow('request','approval'),arrow('approval','ok'),arrow('ok','revise','No'),arrow('revise','request'),arrow('ok','handoff','Yes'),arrow('handoff','release'),arrow('release','return'),arrow('return','service'),arrow('service','work','Yes'),arrow('work','reports'),arrow('service','reports','No'),arrow('reports','end')
].join('\n'),'TB');

let timing='';const tx=[300,500,700,950,1180,1380];
timing+=text(30,40,'Qualitative example: returned late, inspected in good condition',22,'start');
['Request','Approve','Release','Due time','Return'].forEach((v,i)=>{timing+=text(tx[i]+80,90,v,18);timing+=`<path d="M${tx[i]} 110V650" stroke="#CBDDD6" stroke-dasharray="5 5"/>`;});
const signal=(y,name,states)=>{let s=text(25,y+40,name,18,'start');states.forEach((state,i)=>{s+=`<rect x="${tx[i]}" y="${y}" width="${tx[i+1]-tx[i]}" height="80" fill="${i%2?C.pale:C.soft}" stroke="${C.line}" stroke-width="1.5"/>`;s+=text((tx[i]+tx[i+1])/2,y+47,state,16);});return s;};
timing+=signal(145,'Borrowing status',['REQUESTED','APPROVED','RELEASED','OVERDUE','RETURNED']);
timing+=signal(285,'Physical custody',['At office','At office','With borrower','With borrower','At office']);
timing+=signal(425,'Overdue reminder',['Not due','Not due','Not due','Queued once','No new reminder']);
timing+=`<path d="M300 600H1380" stroke="${C.teal}" stroke-width="2" marker-end="url(#arrow)"/>${text(850,636,'Time → (not to scale; reminder processing is periodic)',18)}${text(30,710,'A future booking is not the same as physical custody. Active borrowing blocks availability until an inspected return.',18,'start')}`;
d.push({name:'Timing Diagram',caption:'Qualitative timing, not a measured response-time or SLA claim. OVERDUE is set by the reminder process after the expected return time; reminders are deduplicated.',svg:svgShell(timing,1440,760)});

const rel=(a,b,m='0..*')=>arrow(a,b,'',`dir=both arrowtail=tee arrowhead=${m==='0..1'?'otee':'crowodot'} taillabel="1" headlabel="${m}" labeldistance=1.6`);
add('Entity Relationship Diagram','Core physical entities only; supporting roles/permissions, audit, bookings, settings, damage, and integration tables are omitted for readability. PK = primary key; FK = foreign key; ? = nullable.',[
 entity('cat','equipment_categories',['PK id','name']),entity('loc','equipment_locations',['PK id','name']),entity('gear','equipment',['PK id','FK category_id','FK location_id','asset_code / condition']),entity('farmer','farmer_references',['PK id','external_farmer_id','valid_until']),entity('res','reservations',['PK id','FK equipment_id / farmer_id','starts_at / ends_at / status']),entity('loan','borrowing_transactions',['PK id','FK equipment_id / farmer_id','FK reservation_id? (unique)','status / expected_return_at']),entity('ins','equipment_inspections',['PK id','FK equipment_id / borrowing_id','condition / inspected_at']),entity('ret','return_transactions',['PK id','FK borrowing_id (unique)','FK inspection_id (unique)','returned_at']),entity('usage','utilization_logs',['PK id','FK borrowing_id (unique)','operating_hours']),entity('schedule','maintenance_schedules',['PK id','FK equipment_id','interval_days / next_due_at']),entity('work','maintenance_work_orders',['PK id','FK equipment_id','FK schedule_id?','status / starts_at / ends_at']),entity('record','maintenance_records',['PK id','FK work_order_id','actual_cost / repair_notes']),
 rel('cat','gear'),rel('loc','gear'),rel('gear','res'),rel('farmer','res'),rel('gear','loan'),rel('farmer','loan'),arrow('res','loan','','dir=both arrowtail=otee arrowhead=otee taillabel="0..1" headlabel="0..1"'),rel('loan','ins'),rel('loan','ret','0..1'),rel('ins','ret','0..1'),rel('loan','usage','0..1'),rel('gear','schedule'),rel('gear','work'),arrow('schedule','work','','dir=both arrowtail=otee arrowhead=crowodot taillabel="0..1" headlabel="0..*"'),rel('work','record')
].join('\n'),'TB');

add('SysML Requirement Diagram','Requirements are traced to implemented responsibilities and verification activities. This is a focused system-level traceability view, not a claim of external certification.',[
 entity('r1','«requirement» FR-01',['Secure staff access','Only Admin and Employee roles']),entity('r2','«requirement» FR-02',['Equipment and availability','Register assets; prevent conflicts']),entity('r3','«requirement» FR-03',['Reservation / borrowing approval','Admin approval with verified borrower']),entity('r4','«requirement» FR-04',['Inspected release and return','Keep immutable transaction evidence']),entity('r5','«requirement» FR-05',['Maintenance management','Schedule, start and complete work']),entity('r6','«requirement» FR-06',['Utilization and reporting','Store usage; export CSV / PDF']),
 node('auth','«block»\nAuth + role permissions'),node('book','«block»\nEquipment + booking constraints'),node('trans','«block»\nTransaction workflows'),node('maint','«block»\nMaintenance workflows'),node('report','«block»\nReports + utilization'),node('tests','«testCase»\nDatabase / API / browser checks',`fillcolor="${C.gold}"`),
 arrow('auth','r1','«satisfy»','style=dashed'),arrow('book','r2','«satisfy»','style=dashed'),arrow('trans','r3','«satisfy»','style=dashed'),arrow('trans','r4','«satisfy»','style=dashed'),arrow('maint','r5','«satisfy»','style=dashed'),arrow('report','r6','«satisfy»','style=dashed'),...['r1','r2','r3','r4','r5','r6'].map(x=>arrow('tests',x,'«verify»','style=dashed'))
].join('\n'));

module.exports={d,title,description,C,svgShell,text,box,message};
if(require.main===module)require('./render-detailed.cjs').main(module.exports).catch(error=>{console.error(error);process.exitCode=1;});
