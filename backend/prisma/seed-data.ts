import { hash } from 'bcryptjs';

export interface SeedDatabase {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export const demoId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const rolePermissions: Record<string, string[]> = {
  ADMIN: ['equipment.read','equipment.write','reservation.request','reservation.approve','borrowing.request','borrowing.approve','borrowing.release','return.record','maintenance.read','maintenance.write','report.read','farmer.read','user.manage','integration.manage','audit.read','settings.manage'],
  EMPLOYEE: ['equipment.read','equipment.write','reservation.request','borrowing.request','borrowing.release','return.record','maintenance.read','maintenance.write','report.read','farmer.read']
};

export async function seedReferenceData(db: SeedDatabase) {
  const permissionCodes = [...new Set(Object.values(rolePermissions).flat())];
  for (const code of permissionCodes) {
    await db.query(`INSERT INTO aeams.permissions(code, description) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING`, [code, `Permission to ${code.replace('.', ' ')}`]);
  }
  for (const [role, permissions] of Object.entries(rolePermissions)) {
    const inserted = await db.query(`INSERT INTO aeams.roles(code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING RETURNING id`, [role, role==='ADMIN'?'Admin':'Employee']);
    if (!inserted.rows.length) continue; // Preserve subsequent administrator changes to existing roles.
    for (const permission of permissions) {
      await db.query(`INSERT INTO aeams.role_permissions(role_id, permission_id)
        SELECT r.id, p.id FROM aeams.roles r CROSS JOIN aeams.permissions p WHERE r.code = $1 AND p.code = $2
        ON CONFLICT (role_id, permission_id) DO NOTHING`, [role, permission]);
    }
  }
  for (const module of ['FFRMS','APMS','AISMS','AASMS','ABPMS']) {
    await db.query(`INSERT INTO aeams.integration_connections(module, mode) VALUES ($1, 'DISABLED') ON CONFLICT (module) DO NOTHING`, [module]);
  }
}

export async function seedDemoData(db: SeedDatabase, email: string, password: string) {
  if (password.length < 8) throw new Error('The local demonstration password must contain at least 8 characters.');
  const existing = await db.query('SELECT id FROM aeams.users WHERE id = $1', [demoId(1)]);
  if (existing.rows.length) return false; // Demonstration fixture is installed atomically, once.
  const passwordHash = await hash(password, 12);
  for (const [number, name, role] of [[1,'Fictional Admin','ADMIN'],[2,'Fictional Employee','EMPLOYEE']] as const) {
    await db.query(`INSERT INTO aeams.users(id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)`,
      [demoId(number), number === 1 ? email.toLowerCase().trim() : 'employee@example.test', name, passwordHash]);
    await db.query(`INSERT INTO aeams.user_roles(user_id, role_id) SELECT $1, id FROM aeams.roles WHERE code = $2`, [demoId(number), role]);
  }
  await db.query(`INSERT INTO aeams.equipment_locations(id, code, name, description, is_demo)
    VALUES ($1, 'DEMO-DEPOT', 'Fictional MAO Demonstration Depot', 'Fictional development location; no barangay is asserted as verified.', true)`, [demoId(10)]);
  for (const [number, name] of [[11,'Land preparation'],[12,'Harvest and processing'],[13,'Irrigation'],[14,'Crop care']] as const) {
    await db.query('INSERT INTO aeams.equipment_categories(id, name) VALUES ($1, $2)', [demoId(number), name]);
  }
  const equipment = [
    ['Farm Tractor',11,1250000],['Hand Tractor',11,145000],['Rice Thresher',12,175000],
    ['Water Pump',13,35000],['Irrigation Pump',13,68000],['Knapsack Sprayer',14,6500],
    ['Mechanical Seeder',11,125000],['Corn Sheller',12,95000],['Farm Trailer',11,85000]
  ] as const;
  for (const [index, [name, category, cost]] of equipment.entries()) {
    await db.query(`INSERT INTO aeams.equipment(id, asset_code, name, category_id, location_id, acquisition_date,
      acquisition_cost, funding_source, assigned_office, condition, maintenance_interval_days, is_demo)
      VALUES ($1,$2,$3,$4,$5,current_date - 365,$6,'Fictional development allocation','Demo MAO','GOOD',90,true)`,
      [demoId(100 + index), `DEMO-EQ-${String(index + 1).padStart(3,'0')}`, name, demoId(category), demoId(10), cost]);
  }
  await db.query(`INSERT INTO aeams.farmer_references(id, source, external_farmer_id, display_name,
    barangay_reference, verified_at, valid_until, is_demo)
    VALUES ($1,'MOCK','DEMO-FARMER-001','Fictional Farmer Ana Demo','Fictional Development Barangay',now(),now() + interval '365 days',true)`, [demoId(20)]);
  await db.query(`INSERT INTO aeams.reservations(id, reference_code, equipment_id, farmer_id, requested_by,
    starts_at, ends_at, purpose, usage_location)
    VALUES ($1,'DEMO-RES-001',$2,$3,$4,now()+interval '2 days',now()+interval '3 days','Demonstration land preparation','Fictional Development Farm')`,
    [demoId(200), demoId(100), demoId(20), demoId(1)]);
  await db.query(`UPDATE aeams.reservations SET status = 'APPROVED', approved_by = $1 WHERE id = $2`, [demoId(1), demoId(200)]);
  for (const [index, startDays, endDays] of [[1,-2,2],[2,-5,-1],[3,-10,-8]] as const) {
    const loanId = demoId(300 + index);
    await db.query(`INSERT INTO aeams.borrowing_transactions(id, reference_code, equipment_id, farmer_id,
      requested_by, starts_at, expected_return_at, purpose, farm_reference)
      VALUES ($1,$2,$3,$4,$5,now()+($6::int * interval '1 day'),now()+($7::int * interval '1 day'),'Fictional demonstration operation','MOCK-FARM-001')`,
      [loanId, `DEMO-LOAN-${index}`, demoId(100 + index), demoId(20), demoId(1), startDays, endDays]);
    await db.query(`UPDATE aeams.borrowing_transactions SET status = 'APPROVED', approved_by = $1 WHERE id = $2`, [demoId(1), loanId]);
    await db.query(`UPDATE aeams.borrowing_transactions SET status = 'RELEASED', released_by = $1,
      released_at = starts_at, release_condition = 'GOOD' WHERE id = $2`, [demoId(1), loanId]);
  }
  await db.query(`INSERT INTO aeams.equipment_inspections(id, equipment_id, borrowing_id, inspector_id,
    condition, damage_description, inspected_at) VALUES ($1,$2,$3,$4,'DAMAGED','Fictional cracked pump fitting',now()-interval '8 days')`,
    [demoId(400), demoId(103), demoId(303), demoId(1)]);
  await db.query(`INSERT INTO aeams.return_transactions(reference_code, borrowing_id, inspection_id, received_by, returned_at)
    VALUES ('DEMO-RETURN-001',$1,$2,$3,now()-interval '8 days')`, [demoId(303), demoId(400), demoId(1)]);
  await db.query(`INSERT INTO aeams.damage_reports(inspection_id, description, severity)
    VALUES ($1,'Fictional cracked pump fitting; awaiting repair','MODERATE')`, [demoId(400)]);
  await db.query(`INSERT INTO aeams.utilization_logs(borrowing_id, farm_reference, operating_hours, area_hectares, activity, recorded_by)
    VALUES ($1,'MOCK-FARM-001',12,1.5,'Demonstration irrigation',$2)`, [demoId(303), demoId(1)]);
  await db.query(`INSERT INTO aeams.maintenance_schedules(id, equipment_id, title, interval_days, next_due_at)
    VALUES ($1,$2,'Demonstration preventive inspection',90,now()+interval '14 days')`, [demoId(500), demoId(108)]);
  for (const [index, startDays, endDays] of [[4,-1,1],[5,-20,-19]] as const) {
    const workId = demoId(600 + index);
    await db.query(`INSERT INTO aeams.maintenance_work_orders(id, reference_code, equipment_id, assigned_to,
      type, description, starts_at, ends_at, estimated_cost)
      VALUES ($1,$2,$3,$4,'PREVENTIVE','Fictional preventive servicing',now()+($5::int * interval '1 day'),now()+($6::int * interval '1 day'),1500)`,
      [workId, `DEMO-WO-${index}`, demoId(100 + index), demoId(2), startDays, endDays]);
    await db.query(`UPDATE aeams.maintenance_work_orders SET status = 'IN_PROGRESS' WHERE id = $1`, [workId]);
    if (index === 5) {
      await db.query(`INSERT INTO aeams.maintenance_records(work_order_id, technician_id, actual_cost, repair_notes, performed_at)
        VALUES ($1,$2,1200,'Fictional seals inspected and replaced',now()-interval '19 days')`, [workId,demoId(2)]);
      await db.query(`UPDATE aeams.maintenance_work_orders SET status = 'COMPLETED', completed_at = now()-interval '19 days' WHERE id = $1`, [workId]);
    }
  }
  await db.query(`INSERT INTO aeams.reservations(reference_code, equipment_id, farmer_id, requested_by,
    starts_at, ends_at, purpose, usage_location)
    VALUES ('DEMO-RES-PENDING',$1,$2,$3,now()+interval '4 days',now()+interval '5 days','Fictional seeding request','Fictional Development Farm')`,
    [demoId(106),demoId(20),demoId(1)]);
  await db.query(`INSERT INTO aeams.notifications(user_id, type, title, message)
    VALUES ($1,'DEMO','Fictional demonstration database ready','All farmers, locations, transactions and equipment records in this fixture are fictional.')`, [demoId(1)]);
  await db.query(`UPDATE aeams.integration_connections SET mode = 'MOCK'`);
  await db.query(`INSERT INTO aeams.integration_outbox(target_module,event_type,aggregate_id,idempotency_key,payload)
    VALUES ('APMS','aeams.utilization.recorded.v1',$1,'DEMO-utilization-001',$2::jsonb)`,
    [demoId(303),JSON.stringify({ is_demo: true, borrowing_id: demoId(303), farm_reference: 'MOCK-FARM-001', operating_hours: 12 })]);
  return true;
}

export async function ensureDemoAccounts(db:SeedDatabase,password:string) {
  if (password.length<8) throw new Error('Local development password must be at least 8 characters.');
  const passwordHash=await hash(password,12);
  for (const [number,email,name,role,farmer] of [
    [2,'employee@example.test','Fictional Employee','EMPLOYEE',null]
  ] as const) {
    await db.query(`INSERT INTO aeams.users(id,email,display_name,password_hash,farmer_reference_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,[demoId(number),email,name,passwordHash,farmer]);
    await db.query(`INSERT INTO aeams.user_roles(user_id,role_id) SELECT $1,id FROM aeams.roles WHERE code=$2 ON CONFLICT DO NOTHING`,[demoId(number),role]);
  }
}
