-- Role creation is a DBA task; provisioning never embeds passwords in migrations.
-- Embedded tests do not provision LOGIN roles. Docker initialization does.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aeams_app') THEN
    GRANT USAGE ON SCHEMA aeams TO aeams_app;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA aeams TO aeams_app;
    REVOKE ALL ON aeams.audit_logs, aeams.equipment_bookings FROM aeams_app;
    GRANT SELECT ON aeams.audit_logs, aeams.equipment_bookings TO aeams_app;
    -- Revocable access assignments are not transaction history; removals are audited.
    GRANT DELETE ON aeams.user_roles, aeams.role_permissions TO aeams_app;
    -- Authentication and role administration use explicitly authorized backend code.
    -- No TRUNCATE, DELETE, CREATE, role membership, or migration-table privileges.
    IF to_regclass('aeams._prisma_migrations') IS NOT NULL THEN
      REVOKE ALL ON aeams._prisma_migrations FROM aeams_app;
    END IF;
    REVOKE INSERT, UPDATE ON aeams.equipment_availability, aeams.overdue_borrowings, aeams.dashboard_summary FROM aeams_app;
    GRANT EXECUTE ON FUNCTION aeams.touch_updated_at(), aeams.guard_equipment_archive(),
      aeams.guard_inspection(), aeams.require_workflow_evidence(), aeams.deny_history_mutation() TO aeams_app;
  END IF;
END $$;
