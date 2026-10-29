ALTER TABLE aeams.users ADD COLUMN auth_version integer NOT NULL DEFAULT 0,
  ADD COLUMN farmer_reference_id uuid REFERENCES aeams.farmer_references(id) ON DELETE RESTRICT;
CREATE INDEX users_farmer_reference_idx ON aeams.users(farmer_reference_id);
ALTER TABLE aeams.notifications ADD COLUMN dedupe_key varchar(250);
CREATE UNIQUE INDEX notifications_dedupe_key_key ON aeams.notifications(dedupe_key);
CREATE TABLE aeams.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key varchar(100) UNIQUE NOT NULL,
  value jsonb NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now()
);
CREATE TRIGGER touch_updated_at BEFORE UPDATE ON aeams.system_settings FOR EACH ROW EXECUTE FUNCTION aeams.touch_updated_at();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON aeams.system_settings FOR EACH ROW EXECUTE FUNCTION aeams.record_audit();
INSERT INTO aeams.system_settings(key,value) VALUES ('organization','{"name":"Bongabong Municipal Agriculture Office","system_name":"AgriConnect ERP","timezone":"Asia/Manila"}');
-- Latest application brief grants officers the equipment/transaction processing role.
INSERT INTO aeams.role_permissions(role_id,permission_id)
  SELECT r.id,p.id FROM aeams.roles r CROSS JOIN aeams.permissions p
  WHERE (r.code='AGRICULTURAL_OFFICER' AND p.code IN ('equipment.write','reservation.approve','borrowing.release','return.record'))
     OR (r.code='MAO_ADMIN' AND p.code='integration.manage')
  ON CONFLICT DO NOTHING;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aeams_app') THEN
    GRANT SELECT,INSERT,UPDATE ON aeams.system_settings TO aeams_app;
  END IF;
END $$;
