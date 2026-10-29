const fs=require('node:fs/promises');
const path=require('node:path');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..');
const req=createRequire(path.join(root,'.test-data/diagram-tools/package.json'));
const {instance}=req('@viz-js/viz');
const W=req('docx');
const {chromium}=require(path.join(root,'node_modules/@playwright/test'));
const E=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const detail=[
 ['Requests pass from React through Nginx to the Express API; JWT cookies identify the signed-in staff member.','The API checks permissions before equipment, booking, maintenance, and reporting operations.','PostgreSQL stores records and audit evidence; a separate volume holds authenticated equipment photos.'],
 ['Each staff account has one role: Admin or Employee. One role can be assigned to many accounts.','Equipment and verified farmer references link to reservations and borrowing transactions.','A borrowing may have one return and one utilization log; inspections supply return-condition evidence.'],
 ['Frontend and proxy components call authenticated API capabilities through a same-origin endpoint.','Inventory, transactions, maintenance, reports, and reminders depend on the persistence component.','Database constraints supplement API validation; permissions are enforced on the backend.'],
 ['The local browser reaches Nginx on port 3002; Nginx proxies API calls to the backend container.','The API uses a restricted database login. The migration job uses a separate deployment credential.','Database and photo volumes persist. The dashed Caddy path is a configured production HTTPS option.'],
 ['This fictional snapshot shows a borrowing that has been returned after a good-condition inspection.','Admin A supplies approval; Employee B requests the loan. Both refer to the same transaction.','The return references its inspection, and the utilization log records 2.50 operating hours.'],
 ['Presentation packages contain pages, reusable UI components, authentication context, and API access.','Backend responsibilities are grouped into security, routes, reports, notifications, and integrations.','Dashed dependencies lead to Prisma and PostgreSQL. External module delivery remains unconfigured.'],
 ['An approval request enters through the HTTP port and passes session and permission checks.','The handler opens an actor-scoped transaction and validates borrower and equipment booking rules.','Approval, notification, and audit evidence commit together; a failed constraint rolls back the change.'],
 ['The profile proposes documentation stereotypes for assets, transactions, reviews, and services.','Each extension arrow connects a proposed stereotype to its UML metaclass.','These modeling conventions are annotations, not runtime modules or additional portal roles.'],
 ['Rectangles represent external staff, circles are processes, and cylinders are logical data stores.','Request approval uses verified references and equipment availability before storing a booking.','Inspected returns feed transaction history, asset condition, usage, maintenance alerts, and reports.'],
 ['Admin and Employee share sign-in, inventory, requests, release/return, maintenance, and reporting.','Only Admin approves or rejects requests and manages accounts, integrations, settings, and audit access.','Associations show permitted participation; farmers are external borrower references, not portal users.'],
 ['A request is corrected if reference or equipment checks fail; Admin then approves or rejects it.','Permitted staff inspect and release approved equipment, then inspect it again when returned.','A usable return refreshes availability. Damage flags the asset unavailable and starts maintenance review.'],
 ['Lifelines run downward in time; solid arrows are requests and dashed arrows are responses.','Approval uses an actor-scoped Prisma transaction and PostgreSQL booking/verification constraints.','The alternative fragment distinguishes a committed approval from rollback with a 422 or 409 response.'],
 ['REQUESTED moves to APPROVED only after Admin approval; rejected requests become CANCELLED.','Release requires inspection evidence and a valid window. An unreturned released loan may become OVERDUE.','An inspected return closes RELEASED or OVERDUE as RETURNED. Cancellation is allowed before release.'],
 ['Messages are numbered to show the order of collaboration among the participating objects.','The API verifies authorization before opening the database transaction and applying booking rules.','Approval, notification, and audit writes commit together; the UI then displays the approved result.'],
 ['Each ref frame summarizes an interaction; diamonds select approval and maintenance paths.','When a reservation is used, a linked borrowing must be created and approved before equipment release.','Rejection returns to request revision; inspected returns lead to maintenance when required, then reports.'],
 ['The phases illustrate request, approval, release, due time, and a late inspected return.','Borrowing status changes while custody remains with the borrower until the physical return.','Overdue reminders are periodic and deduplicated. This is qualitative timing, not a performance SLA.'],
 ['PK identifies a primary key; FK identifies a foreign key. A question mark denotes a nullable field.','A reservation may link to one borrowing. Each borrowing has at most one return and one usage log.','This core ERD omits supporting audit, authorization, booking, damage, settings, and integration tables.'],
 ['FR-01 through FR-06 cover staff access, inventory, approvals, inspections, maintenance, and reporting.','Dashed satisfy links map implementation responsibilities to the requirements they address.','Dashed verify links map database, API, and browser checks to requirements; this is not certification.']
];

function manualTools(src){
 const {C,svgShell}=src;
 const label=(x,y,lines,size=20)=>lines.map((s,i)=>`<text x="${x}" y="${y+(i-(lines.length-1)/2)*(size+5)}" text-anchor="middle" font-size="${size}" fill="${C.ink}">${E(s)}</text>`).join('');
 const box=(x,y,w,h,lines,size=22)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${C.soft}" stroke="${C.line}" stroke-width="2"/>${label(x+w/2,y+h/2+6,lines,size)}`;
 const edge=(d)=>`<path d="${d}" fill="none" stroke="${C.teal}" stroke-width="2" marker-end="url(#arrow)"/>`;
 const panel=(x,y,w,h,name)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.pale}" stroke="${C.teal}" stroke-width="2"/><text x="${x+20}" y="${y+24}" font-size="18" fill="${C.teal}">${E(name)}</text>`;
 const store=(x,y,w,h,lines)=>`<path d="M${x} ${y+12}C${x} ${y-4} ${x+w} ${y-4} ${x+w} ${y+12}V${y+h-12}C${x+w} ${y+h+4} ${x} ${y+h+4} ${x} ${y+h-12}Z" fill="${C.soft}" stroke="${C.line}" stroke-width="2"/><path d="M${x} ${y+12}C${x} ${y+28} ${x+w} ${y+28} ${x+w} ${y+12}" fill="none" stroke="${C.line}" stroke-width="2"/>${label(x+w/2,y+h/2+11,lines,20)}`;
 return {label,box,edge,panel,store,svgShell,C};
}

function architecture(src){
 const {label,box,edge,panel,store,svgShell}=manualTools(src);
 let s=box(155,20,190,55,['Admin'])+box(705,20,190,55,['Employee']);
 s+=panel(50,100,1000,115,'PRESENTATION')+box(120,135,330,65,['React browser interface'])+box(650,135,330,65,['Nginx web / API proxy']);
 s+=panel(50,245,1000,160,'APPLICATION SERVICES')+box(120,285,330,90,['JWT session verification','Admin / Employee permissions'],21)+box(650,285,330,90,['Express API','Workflows, reports, reminders'],21);
 s+=panel(50,510,1000,150,'PERSISTENCE')+store(75,550,290,80,['Centralized PostgreSQL','aeams schema'])+box(410,550,290,80,['Prisma','Restricted DB login'],21)+box(745,550,290,80,['Equipment photos','Persistent upload volume'],20);
 s+=edge('M250 75L285 135')+edge('M800 75L320 135')+edge('M450 168H650')+label(550,153,['Same-origin API'],18);
 s+=edge('M815 200V228H285V285')+edge('M450 330H650')+label(550,315,['Authorized call'],18);
 s+=edge('M720 375L555 550')+label(565,474,['Record access'],18);
 s+=edge('M920 375L890 550')+label(976,474,['Photo access'],18);
 s+=edge('M410 590H365');
 return svgShell(s,1100,700);
}

function components(src){
 const {label,box,edge,store,svgShell,C}=manualTools(src);
 const comp=(x,y,lines)=>box(x,y,300,82,['«component»',...lines],21);
 let s=comp(60,45,['React frontend'])+comp(400,45,['Nginx gateway'])+comp(740,45,['Auth + authorization']);
 s+=comp(60,250,['Equipment inventory','and photographs'])+comp(400,250,['Reservations, borrowing','and inspected returns'])+comp(740,250,['Maintenance management']);
 s+=comp(220,420,['Reports and utilization'])+comp(620,420,['Notification scheduler']);
 s+=comp(400,610,['Prisma persistence'])+store(740,610,300,82,['PostgreSQL','Constraints and audit']);
 s+=edge('M360 86H400')+edge('M700 86H740');
 s+=`<path d="M890 127V190H210" fill="none" stroke="${C.teal}" stroke-width="2"/>`+label(550,175,['Authorized capabilities'],18);
 s+=edge('M210 190V250')+edge('M550 190V250')+edge('M890 190V250')+edge('M380 190V395H370V420')+edge('M720 190V395H770V420');
 s+=edge('M210 332V560H505V610')+edge('M550 332V610')+edge('M1040 291H1070V560H595V610');
 s+=edge('M370 502V580H525V610')+edge('M770 502V580H575V610')+edge('M700 651H740');
 return svgShell(s,1100,730);
}

function dataflow(src){
 const {label,box,edge,store,svgShell,C}=manualTools(src);
 const ys=[160,300,440,580,720,860];
 const process=(i,lines)=>`<ellipse cx="450" cy="${ys[i]}" rx="110" ry="51" fill="${C.pale}" stroke="${C.teal}" stroke-width="2"/>${label(450,ys[i]+6,[`${i+1}.0`,...lines],20)}`;
 let s=box(30,40,235,76,['Admin / Employee'],21)+label(147,153,['Approvals: Admin only'],18);
 s+=process(0,['Authenticate'])+process(1,['Manage inventory'])+process(2,['Request / approve','bookings'])+process(3,['Release / inspect','returns'])+process(4,['Manage maintenance'])+process(5,['Reports / reminders']);
 s+=store(750,121,310,78,['D1 Users / roles'])+store(750,261,310,78,['D2 Equipment / photos'])+store(750,366,310,78,['D3 Farmer references'])+store(750,502,310,92,['D4 Transactions','Reservations / borrowing','Inspections / returns'])+store(750,681,310,78,['D5 Maintenance records'])+store(750,821,310,78,['D6 Usage / alerts / audit']);
 s+=edge('M265 78H300V140L342 149')+label(310,108,['Credentials'],18);
 s+=edge('M340 170H285V116H265')+label(307,206,['Session'],18);
 s+=`<path d="M250 116V860" stroke="${C.line}" stroke-width="2" fill="none"/>`;
 for(const [i,labelText] of [[1,'Asset'],[2,'Request'],[3,'Inspection'],[4,'Work'],[5,'Filters']])s+=edge(`M250 ${ys[i]}H340`)+label(296,ys[i]-17,[labelText],18);
 s+=edge('M750 160H560')+label(652,146,['Account + role'],18);
 s+=edge('M560 300H750')+label(652,286,['Asset records'],18);
 s+=edge('M750 329H610V400L548 417')+label(665,361,['Asset state'],18);
 s+=edge('M750 406L560 440')+label(652,394,['Verification'],18);
 s+=edge('M548 461H665V522H750')+label(678,493,['Booking'],18);
 s+=edge('M750 552L560 572')+label(654,548,['Approved loan'],18);
 s+=edge('M556 598L750 579')+label(651,646,['Return evidence'],18);
 s+=edge('M560 720H750')+label(654,706,['Work records'],18);
 s+=edge('M750 751H700V827L548 845')+label(668,790,['Cost / downtime'],18);
 s+=edge('M750 879H560')+label(652,911,['Usage / alerts'],18);
 s+=edge('M560 849H730V838H750');
 s+=edge('M540 610H1080V965H900V899')+label(776,951,['Recorded usage / damage alerts'],18);
 s+=edge('M340 880H225V78H265')+label(120,941,['Reports + notifications'],18);
 return svgShell(s,1100,1000);
}

function activity(src){
 const {C,svgShell}=src;
 const text=(x,y,s,size=20,anchor='middle')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${C.ink}">${E(s)}</text>`;
 const label=(x,y,lines)=>lines.map((s,i)=>text(x,y+(i-(lines.length-1)/2)*24,s)).join('');
 const box=(x,y,w,h,lines)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.soft}" stroke="${C.line}" stroke-width="2"/>${label(x+w/2,y+h/2+6,lines)}`;
 const diamond=(x,y,lines)=>`<path d="M${x} ${y-51}L${x+205} ${y}L${x} ${y+51}L${x-205} ${y}Z" fill="${C.pale}" stroke="${C.teal}" stroke-width="2"/>${label(x,y+6,lines)}`;
 const edge=(d,labelText='',x=0,y=0)=>`<path d="${d}" fill="none" stroke="${C.teal}" stroke-width="2.2" marker-end="url(#arrow)"/>${labelText?text(x,y,labelText,17):''}`;
 let s=text(260,30,'REQUEST AND RELEASE',18)+text(830,30,'RETURN AND MAINTENANCE',18);
 s+=`<circle cx="260" cy="58" r="9" fill="${C.green}"/>`+box(50,88,420,74,['1. Submit borrowing request','Employee / Admin']);
 s+=diamond(260,235,['2. Reference and asset','checks valid?'])+box(50,320,420,68,['3. Admin reviews request']);
 s+=diamond(260,465,['4. Approve request?'])+box(50,554,420,74,['5. Inspect and release','Approved borrowing window']);
 s+=box(50,675,420,64,['6. Borrower uses equipment'])+box(50,800,420,64,['Cancel with rejection reason']);
 s+=box(620,88,420,80,['7. Inspect the actual return','Record condition and usage']);
 s+=diamond(830,242,['8. Usable condition?']);
 s+=box(620,340,420,74,['Close borrowing','Refresh equipment availability']);
 s+=box(620,465,420,80,['Close borrowing; flag unavailable','Record damage / alert maintenance']);
 s+=box(620,626,420,90,['9. Schedule, start and complete','maintenance with assessment']);
 s+=`<circle cx="830" cy="844" r="15" fill="white" stroke="${C.teal}" stroke-width="2"/><circle cx="830" cy="844" r="9" fill="${C.green}"/>`;
 s+=edge('M260 67V88')+edge('M260 162V184')+edge('M260 286V320','Yes',282,308);
 s+=edge('M55 235H22V126H50','No: correct request',135,196);
 s+=edge('M260 388V414')+edge('M260 516V554','Yes',285,544);
 s+=edge('M55 465H22V832H50','No',36,493);
 s+=edge('M260 628V675')+edge('M470 707H550V128H620');
 s+=edge('M830 168V191')+edge('M1035 242H1077V377H1040','Yes',1053,284);
 s+=edge('M625 242H580V505H620','No',598,472);
 s+=edge('M830 545V626')+edge('M830 716V829');
 s+=edge('M1040 377H1077V844H845')+edge('M470 832H815');
 return svgShell(s,1100,900);
}

function overview(src){
 const {C,svgShell}=src;
 const text=(x,y,s,size=20)=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" fill="${C.ink}">${E(s)}</text>`;
 const ref=(x,y,lines)=>`<rect x="${x}" y="${y}" width="420" height="85" fill="${C.soft}" stroke="${C.teal}" stroke-width="2"/><path d="M${x} ${y+25}H${x+50}L${x+65} ${y+10}V${y}" fill="none" stroke="${C.teal}"/>${text(x+28,y+19,'ref',15)}${lines.map((s,i)=>text(x+210,y+49+i*24,s)).join('')}`;
 const dia=(x,y,s)=>`<path d="M${x} ${y-43}L${x+192} ${y}L${x} ${y+43}L${x-192} ${y}Z" fill="${C.pale}" stroke="${C.teal}" stroke-width="2"/>${text(x,y+6,s)}`;
 const edge=(s)=>`<path d="${s}" fill="none" stroke="${C.teal}" stroke-width="2.2" marker-end="url(#arrow)"/>`;
 let s=text(260,28,'REQUEST INTERACTIONS',18)+text(830,28,'FULFILLMENT INTERACTIONS',18);
 s+=`<circle cx="260" cy="52" r="9" fill="${C.green}"/>`;
 s+=ref(50,80,['Sign in and load permissions'])+ref(50,208,['View equipment and availability'])+ref(50,336,['Submit reservation / borrowing'])+ref(50,464,['Admin reviews request'])+dia(260,649,'Approved?');
 s+=ref(620,80,['Create / approve linked borrowing','if using an approved reservation'])+ref(620,208,['Inspect and release equipment'])+ref(620,336,['Record inspected return + usage'])+dia(830,521,'Maintenance needed?');
 s+=ref(620,620,['Schedule / process maintenance'])+ref(620,758,['View reports and notifications']);
 s+=`<circle cx="830" cy="890" r="15" fill="white" stroke="${C.teal}" stroke-width="2"/><circle cx="830" cy="890" r="9" fill="${C.green}"/>`;
 s+=edge('M260 61V80')+edge('M260 165V208')+edge('M260 293V336')+edge('M260 421V464')+edge('M260 549V606');
 s+=edge('M452 649H550V123H620')+text(503,633,'Yes',17);
 s+=edge('M68 649H22V378H50')+text(85,700,'No: revise request',17);
 s+=edge('M830 165V208')+edge('M830 293V336')+edge('M830 421V478');
 s+=edge('M830 564V620')+text(853,596,'Yes',17);
 s+=edge('M1022 521H1077V800H1040')+text(1053,567,'No',17);
 s+=edge('M830 705V758')+edge('M830 843V875');
 return svgShell(s,1100,930);
}

function bounds(svg){const v=svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);return {w:v[2],h:v[3]};}
function placement(svg){
 const b=bounds(svg),sizes=[...svg.matchAll(/font-size="([0-9.]+)"/g)].map(m=>Number(m[1]));
 const minFont=Math.min(...sizes.filter(n=>n>=16),16);
 const options=[false,true].map(portrait=>{const w=portrait?666:995,h=portrait?702:405,scale=Math.min(w/b.w,h/b.h);return {portrait,scale,w:b.w*scale,h:b.h*scale,legibilityPt:minFont*scale*0.75};});
 return options.sort((a,b)=>b.legibilityPt-a.legibilityPt)[0];
}

async function main(src){
 const {d,title,description,C}=src;
 const viz=await instance();await fs.mkdir(path.join(__dirname,'diagrams'),{recursive:true});await fs.mkdir(path.join(__dirname,'sources'),{recursive:true});
 const proof=path.join(root,'.test-data/diagram-layout-review');await fs.mkdir(proof,{recursive:true});
 for(let i=0;i<d.length;i++){
  const item=d[i];item.index=i+1;item.slug=String(i+1).padStart(2,'0')+'-'+item.name.toLowerCase().replaceAll(' ','-');item.details=detail[i];
  item.custom=[0,2,8,10,11,14,15].includes(i);
  if(i===0)item.svg=architecture(src);if(i===2)item.svg=components(src);if(i===8)item.svg=dataflow(src);
  if(i===10)item.svg=activity(src);if(i===14)item.svg=overview(src);
  if([11,15].includes(i))item.svg=item.svg.replaceAll('font-size="16"','font-size="22"').replaceAll('font-size="18"','font-size="24"');
  if(i===11)item.svg=item.svg.replace('x="555" y="210" width="220" height="30"','x="555" y="210" width="280" height="36"');
  if(i===15)item.svg=item.svg.replace(/<text x="30" y="710"[^>]*>[^<]*<\/text>/,'<text x="30" y="705" font-size="22" fill="'+C.ink+'">Active borrowing blocks new availability until an inspected return.</text><text x="30" y="738" font-size="22" fill="'+C.ink+'">A future booking is different from physical custody.</text>');
  if([10,14].includes(i))item.svg=item.svg.replaceAll('font-size="15"','font-size="18"').replaceAll('font-size="17"','font-size="18"').replaceAll('font-size="18"','font-size="20"');
  let candidates=[];
  if(item.dot&&![0,2,8,10,14].includes(i)){
   const directions=i===0?['TB']:['LR','TB'];
   for(const dir of directions){const dot=item.dot.replace(/rankdir=(LR|TB)/,`rankdir=${dir}`);const raw=viz.renderString(dot,{format:'svg'});const svg=raw.slice(raw.indexOf('<svg'));candidates.push({svg,dot,...placement(svg)});}
  }else candidates=[{svg:item.svg,...placement(item.svg)}];
  Object.assign(item,candidates.sort((a,b)=>b.legibilityPt-a.legibilityPt)[0]);
  item.rawBounds=bounds(item.svg);
  const scale=Math.min(2.8,2500/Math.max(item.rawBounds.w,item.rawBounds.h));item.capture={w:Math.ceil(item.rawBounds.w*scale),h:Math.ceil(item.rawBounds.h*scale)};
  await fs.writeFile(path.join(__dirname,'diagrams',item.slug+'.svg'),item.svg);
  if(item.dot&&!item.custom)await fs.writeFile(path.join(__dirname,'sources',item.slug+'.dot'),item.dot);
  else {await fs.writeFile(path.join(__dirname,'sources',item.slug+'.svg'),item.svg);await fs.unlink(path.join(__dirname,'sources',item.slug+'.dot')).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 }
 const browser=await chromium.launch({channel:'msedge',headless:true});let layout=[];
 try{
  const page=await browser.newPage({viewport:{width:1800,height:1200},deviceScaleFactor:1});
  for(const item of d){
   await page.setViewportSize({width:item.capture.w,height:item.capture.h});await page.setContent(`<style>html,body{margin:0;background:white}svg{display:block;width:100vw;height:100vh}</style>${item.svg}`);
   item.clippedLabels=await page.locator('svg').evaluate(svg=>{
    const inverse=svg.getScreenCTM().inverse(),v=svg.viewBox.baseVal;
    return [...svg.querySelectorAll('text')].filter(t=>{
     const b=t.getBBox(),m=inverse.multiply(t.getScreenCTM());const ps=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));
     return ps.some(p=>p.x<v.x-1||p.y<v.y-1||p.x>v.x+v.width+1||p.y>v.y+v.height+1);
    }).map(t=>t.textContent);
   });
   if(item.clippedLabels.length)throw Error('SVG label outside canvas in '+item.name+': '+item.clippedLabels.join('; '));
   await page.screenshot({path:path.join(__dirname,'diagrams',item.slug+'.png')});
  }
  const cover=`<article class="sheet cover"><div class="brand">AEAMS · DETAILED SYSTEM DESIGN</div><h1>${E(title)}</h1><div class="accent"></div><p class="intro">${E(description)}</p><p class="scope"><b>Roles:</b> Admin and Employee &nbsp; | &nbsp; <b>Data platform:</b> centralized PostgreSQL<br/><b>Theme:</b> green and teal &nbsp; | &nbsp; <b>Layout:</b> one diagram per page, with notes and notation</p><div class="index">${d.map(x=>`<a href="#${x.slug}"><b>${String(x.index).padStart(2,'0')}</b>${x.name}</a>`).join('')}</div><p class="coverNote">Based on the implemented AEAMS model, permissions, and workflows. Examples are fictional. Modeling-only conventions, omitted supporting entities, and the optional HTTPS deployment path are identified where applicable.</p><footer><span>Diagram guide · Reviewed page-by-page</span><span>Cover</span></footer></article>`;
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AEAMS — Detailed diagrams</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:${C.ink};background:#e4ece7}.toolbar{padding:14px 24px;background:${C.green};color:white;display:flex;justify-content:space-between}.toolbar button{padding:6px 14px;border:1px solid white;background:transparent;color:white;cursor:pointer}.sheet{width:297mm;height:210mm;background:white;padding:12mm 14mm;margin:20px auto;display:grid;grid-template-rows:88px minmax(0,1fr) 116px 22px;gap:9px;page:landscape;break-after:page;box-shadow:0 3px 20px #17362a18}.sheet.portrait{width:210mm;height:297mm;grid-template-rows:92px minmax(0,1fr) 142px 22px;page:portrait}.brand{color:${C.teal};font-size:10px;letter-spacing:1.2px;font-weight:bold}h2{font-size:24px;line-height:1.2;color:${C.green};margin:8px 0}.caption{font-size:12px;line-height:1.45;color:${C.muted};margin:0}.figure{display:flex;align-items:center;justify-content:center;border:1px solid #cfe2d8;border-radius:8px;padding:10px;min-height:0;overflow:hidden}.figure svg{width:100%;height:100%;object-fit:contain}.details{padding:10px 13px;background:${C.pale};border-left:4px solid ${C.teal};overflow:hidden}.details h3{margin:0 0 6px;font-size:12px;color:${C.teal}}.details ul{margin:0;padding-left:18px;font-size:12px;line-height:1.5}.details li{padding:0;margin:0 0 4px}footer{display:flex;align-items:end;justify-content:space-between;font-size:10px;color:${C.muted};border-top:1px solid #d7e7df;padding-top:6px}.cover{display:block;position:relative}h1{font-size:34px;line-height:1.2;max-width:900px;margin:18px 0}.accent{width:110px;height:5px;background:${C.teal};margin:18px 0}.intro{font-size:15px;line-height:1.7;max-width:950px}.scope{font-size:13px;line-height:1.9}.index{display:grid;grid-template-columns:repeat(3,1fr);gap:10px 22px;margin-top:24px}.index a{font-size:12px;text-decoration:none;color:${C.ink};border-bottom:1px solid #d7e7df;padding:8px 0}.index b{display:inline-block;color:${C.teal};margin-right:10px}.coverNote{font-size:11px;line-height:1.6;margin-top:25px;color:${C.muted}}.cover footer{position:absolute;bottom:12mm;left:14mm;right:14mm}@page landscape{size:A4 landscape;margin:0}@page portrait{size:A4 portrait;margin:0}@media print{body{background:white}.toolbar{display:none}.sheet{margin:0;box-shadow:none}.sheet:last-child{break-after:auto}}</style></head><body><div class="toolbar"><strong>AEAMS · Detailed diagrams</strong><button onclick="window.print()">Print / Save PDF</button></div>${cover}${d.map(x=>`<article class="sheet ${x.portrait?'portrait':''}" id="${x.slug}"><header><div class="brand">AGRICULTURAL EQUIPMENT AND ASSET MANAGEMENT SYSTEM</div><h2>${String(x.index).padStart(2,'0')} · ${E(x.name)}</h2><p class="caption">${E(x.caption)}</p></header><div class="figure">${x.svg}</div><aside class="details"><h3>HOW TO READ THIS DIAGRAM</h3><ul>${x.details.map(s=>`<li>${E(s)}</li>`).join('')}</ul></aside><footer><span>Admin + Employee · Green and teal</span><span>Figure ${x.index} / 18</span></footer></article>`).join('')}</body></html>`;
  await fs.writeFile(path.join(__dirname,'AEAMS-Diagrams.html'),html);await page.setViewportSize({width:1440,height:1200});await page.setContent(html,{waitUntil:'load'});
  layout=await page.locator('.sheet:not(.cover)').evaluateAll(sheets=>sheets.map(s=>{
   const header=s.querySelector('header'),detail=s.querySelector('.details'),frame=s.querySelector('.figure'),svg=frame.querySelector('svg');
   const f=frame.getBoundingClientRect(),vb=svg.viewBox.baseVal,scale=Math.min((f.width-22)/vb.width,(f.height-22)/vb.height);
   const texts=[...svg.querySelectorAll('text')].map(t=>({text:t.textContent,original:parseFloat(t.getAttribute('font-size')||'16'),size:parseFloat(t.getAttribute('font-size')||'16')*scale*.75}));
   return {name:s.id,headerOverflow:header.scrollHeight>header.clientHeight+1,notesOverflow:detail.scrollHeight>detail.clientHeight+1,minPrintedPt:Math.min(...texts.map(t=>t.size)),minBodyPt:Math.min(...texts.filter(t=>t.original>=16).map(t=>t.size)),texts:texts.length};
  }));
  for(let i=0;i<d.length;i++)await page.locator('.sheet').nth(i+1).screenshot({path:path.join(proof,d[i].slug+'.png')});
  await page.pdf({path:path.join(__dirname,'AEAMS-Diagrams.pdf'),printBackground:true,preferCSSPageSize:true});
  const sheets=await page.locator('.sheet:not(.cover)').allInnerTexts();if(sheets.length!==18)throw Error('Expected exactly 18 diagram pages.');
  const clipped=layout.filter(x=>x.headerOverflow||x.notesOverflow);if(clipped.length)throw Error('Page text overflows: '+clipped.map(x=>x.name).join(', '));
  const tiny=layout.filter(x=>x.minPrintedPt<7.5);if(tiny.length)throw Error('Printed labels too small: '+tiny.map(x=>x.name).join(', '));
  await page.locator('.sheet').nth(1).screenshot({path:path.join(__dirname,'preview-architecture.png')});
 }finally{await browser.close();}
 const color=s=>s.slice(1);
 const p=(s,{size=20,bold=false,after=60,before=0,...opts}={})=>new W.Paragraph({children:[new W.TextRun({text:s,size,bold,color:color(C.ink),font:'Arial'})],spacing:{after,before},...opts});
 const section=(children,portrait=false)=>({properties:{type:W.SectionType.NEXT_PAGE,page:{size:{width:portrait?11906:16838,height:portrait?16838:11906,orientation:portrait?W.PageOrientation.PORTRAIT:W.PageOrientation.LANDSCAPE},margin:{top:650,bottom:650,left:650,right:650,footer:300}}},footers:{default:new W.Footer({children:[new W.Paragraph({alignment:W.AlignmentType.RIGHT,children:[new W.TextRun({text:'AEAMS · Detailed system diagrams  |  ',size:17,color:color(C.muted)}),new W.TextRun({children:[W.PageNumber.CURRENT],size:17})]})]})},children});
 const cover=[p('AEAMS · DETAILED SYSTEM DESIGN',{size:22,bold:true,before:320,after:260}),p(title,{size:56,bold:true,after:260}),p(description,{size:24,after:200}),p('Users: Admin and Employee | Technology: React, Express, Prisma, PostgreSQL',{size:22,after:100}),p('Green and teal · One diagram per page with detailed interpretation notes',{size:22,after:180}),p('Diagram index',{size:28,bold:true,after:150}),...Array.from({length:6},(_,i)=>p(d.slice(i*3,i*3+3).map(x=>`${String(x.index).padStart(2,'0')} ${x.name}`).join('   •   '),{size:20,after:90})),p('Fictional examples and modeling-only conventions are identified. The core ERD omits supporting tables for readability; the captions state its scope.',{size:20,before:160})];
 const sections=[section(cover)];
 for(const x of d){
  const area={w:x.portrait?690:1020,h:x.portrait?730:430},scale=Math.min((area.w-24)/x.rawBounds.w,(area.h-24)/x.rawBounds.h);
  const image=new W.ImageRun({type:'png',data:await fs.readFile(path.join(__dirname,'diagrams',x.slug+'.png')),transformation:{width:x.rawBounds.w*scale,height:x.rawBounds.h*scale},altText:{title:x.name,description:x.caption,name:x.name}});
  const border={style:W.BorderStyle.SINGLE,size:4,color:'CFE2D8'};
  const frame=new W.Table({width:{size:area.w*15,type:W.WidthType.DXA},rows:[new W.TableRow({height:{value:area.h*15,rule:W.HeightRule.EXACT},cantSplit:true,children:[new W.TableCell({verticalAlign:W.VerticalAlign.CENTER,margins:{top:60,bottom:60,left:60,right:60},borders:{top:border,bottom:border,left:border,right:border},children:[new W.Paragraph({alignment:W.AlignmentType.CENTER,spacing:{before:0,after:0},children:[image]})]})]})]});
  const content=[p('AGRICULTURAL EQUIPMENT AND ASSET MANAGEMENT SYSTEM',{size:16,bold:true,after:70}),p(`${String(x.index).padStart(2,'0')}  ${x.name}`,{size:32,bold:true,after:75,keepNext:true}),p(x.caption,{size:19,after:100,keepNext:true}),frame,p('HOW TO READ THIS DIAGRAM',{size:19,bold:true,before:110,after:65}),...x.details.map(s=>p('• '+s,{size:19,after:55}))];
  sections.push(section(content,x.portrait));
 }
 const document=new W.Document({creator:'AEAMS project',title:`${title} — Detailed System Diagrams`,description,styles:{default:{document:{run:{font:'Arial',size:20}}}},sections});
 await fs.writeFile(path.join(__dirname,'AEAMS-Diagrams.docx'),await W.Packer.toBuffer(document));
 const report={diagramCount:18,expectedPages:19,theme:'Green and teal',notesPerFigure:3,pages:layout.map((p,i)=>({...p,orientation:d[i].portrait?'portrait':'landscape',graphBounds:d[i].rawBounds,labelsOutsideCanvas:d[i].clippedLabels}))};
 await fs.writeFile(path.join(__dirname,'layout-report.json'),JSON.stringify(report,null,2));
 await fs.writeFile(path.join(__dirname,'README.txt'),`${title}\nDETAILED EDITION\n\n19 pages: one cover and 18 individual diagram pages.\nGreen and teal theme. Each diagram has three detailed interpretation notes.\nThe generator compares diagram orientation/layout to improve printed legibility.\n\nPDF and Word: AEAMS-Diagrams.pdf / AEAMS-Diagrams.docx\nHTML: AEAMS-Diagrams.html\nIndividual scalable SVG and high-resolution PNG: diagrams/\nEditable Graphviz sources: sources/ (custom SVG diagrams are generated in render-detailed.cjs)\nRegenerate inside this project with: node artifacts/aeams-diagrams/generate.cjs\nLibraries: @viz-js/viz and docx under .test-data/diagram-tools; Playwright in project dependencies.\nlayout-report.json records page clipping and rendered text size checks.\n\nAdmin and Employee are the only portal roles. Farmers are borrower references.\nAll example object values are fictional. The ERD is a core subset, with omissions stated in its caption.\n`);
 console.log(JSON.stringify(report.pages.map(x=>({page:x.name,orientation:x.orientation,minPt:Number(x.minPrintedPt.toFixed(1)),overflow:x.headerOverflow||x.notesOverflow})),null,2));
 console.log('Detailed Word, PDF, images and layout report generated.');
}
module.exports={main};
if(require.main===module)main(require('./generate.cjs')).catch(error=>{console.error(error);process.exitCode=1;});
