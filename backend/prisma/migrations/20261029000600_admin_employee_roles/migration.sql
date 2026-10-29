BEGIN;
-- Account UUIDs and every operational/audit reference remain unchanged.
INSERT INTO aeams.roles(code,name) VALUES ('ADMIN','Admin'),('EMPLOYEE','Employee') ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name;
-- Retiring borrower portal access must not automatically grant staff privileges.
UPDATE aeams.users u SET active=false,archived_at=coalesce(archived_at,now())
WHERE EXISTS (SELECT 1 FROM aeams.user_roles ur JOIN aeams.roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.code='FARMER_BORROWER')
AND NOT EXISTS (SELECT 1 FROM aeams.user_roles ur JOIN aeams.roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.code IN ('SUPER_ADMIN','MAO_ADMIN','EQUIPMENT_MANAGER','AGRICULTURAL_OFFICER','MAINTENANCE_PERSONNEL','ADMIN','EMPLOYEE'));
INSERT INTO aeams.user_roles(user_id,role_id)
SELECT u.id,r.id FROM aeams.users u JOIN aeams.roles r ON r.code=CASE WHEN EXISTS (
  SELECT 1 FROM aeams.user_roles ur JOIN aeams.roles old_role ON old_role.id=ur.role_id
  WHERE ur.user_id=u.id AND old_role.code IN ('SUPER_ADMIN','MAO_ADMIN','ADMIN')
) THEN 'ADMIN' ELSE 'EMPLOYEE' END
WHERE EXISTS (SELECT 1 FROM aeams.user_roles existing WHERE existing.user_id=u.id)
ON CONFLICT(user_id,role_id) DO NOTHING;
DELETE FROM aeams.user_roles ur USING aeams.roles r WHERE ur.role_id=r.id AND r.code NOT IN ('ADMIN','EMPLOYEE');
DELETE FROM aeams.user_roles ur USING aeams.roles r WHERE ur.role_id=r.id AND r.code='EMPLOYEE'
  AND EXISTS (SELECT 1 FROM aeams.user_roles a JOIN aeams.roles ar ON ar.id=a.role_id WHERE a.user_id=ur.user_id AND ar.code='ADMIN');
DELETE FROM aeams.role_permissions rp USING aeams.roles r WHERE rp.role_id=r.id AND r.code NOT IN ('ADMIN','EMPLOYEE');
DELETE FROM aeams.roles WHERE code NOT IN ('ADMIN','EMPLOYEE');
ALTER TABLE aeams.roles ADD CONSTRAINT supported_application_roles CHECK (code IN ('ADMIN','EMPLOYEE'));
CREATE UNIQUE INDEX user_one_application_role ON aeams.user_roles(user_id);
INSERT INTO aeams.permissions(code,description) SELECT code,'Permission to '||replace(code,'.',' ') FROM unnest(ARRAY[
 'equipment.read','equipment.write','reservation.request','reservation.approve','borrowing.request','borrowing.approve','borrowing.release','return.record',
 'maintenance.read','maintenance.write','report.read','farmer.read','user.manage','integration.manage','audit.read','settings.manage'
]) code ON CONFLICT(code) DO NOTHING;
INSERT INTO aeams.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM aeams.roles r CROSS JOIN aeams.permissions p WHERE
 (r.code='ADMIN' AND p.code IN ('equipment.read','equipment.write','reservation.request','reservation.approve','borrowing.request','borrowing.approve','borrowing.release','return.record','maintenance.read','maintenance.write','report.read','farmer.read','user.manage','integration.manage','audit.read','settings.manage'))
 OR (r.code='EMPLOYEE' AND p.code IN ('equipment.read','equipment.write','reservation.request','borrowing.request','borrowing.release','return.record','maintenance.read','maintenance.write','report.read','farmer.read'))
ON CONFLICT DO NOTHING;
-- Retain two active fictional demo logins, preserving older identities for history.
UPDATE aeams.users SET display_name='Fictional Admin'
 WHERE id='00000000-0000-4000-8000-000000000001' AND display_name LIKE 'Fictional %';
UPDATE aeams.users SET display_name='Fictional Employee',email='employee@example.test'
 WHERE id='00000000-0000-4000-8000-000000000002' AND display_name LIKE 'Fictional %' AND email='technician@example.test'
 AND NOT EXISTS (SELECT 1 FROM aeams.users WHERE email='employee@example.test');
UPDATE aeams.users SET active=false,archived_at=coalesce(archived_at,now())
 WHERE id IN ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004')
 AND display_name LIKE 'Fictional %' AND email IN ('officer@example.test','borrower@example.test');
UPDATE aeams.users SET auth_version=auth_version+1;
COMMIT;
