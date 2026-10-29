-- PostgreSQL-specific invariants are intentionally kept in SQL migrations.
-- Prisma db push cannot reproduce these triggers, checks, views or exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

ALTER TABLE aeams.users ADD CONSTRAINT users_email_normalized CHECK (email = lower(trim(email))),
  ADD CONSTRAINT users_identity_present CHECK (password_hash IS NOT NULL OR erp_subject IS NOT NULL);
ALTER TABLE aeams.equipment ADD CONSTRAINT equipment_condition CHECK (condition IN ('EXCELLENT','GOOD','FAIR','DAMAGED','UNSERVICEABLE')),
  ADD CONSTRAINT equipment_cost CHECK (acquisition_cost >= 0),
  ADD CONSTRAINT equipment_interval CHECK (maintenance_interval_days > 0),
  ADD CONSTRAINT equipment_year CHECK (year_manufactured BETWEEN 1900 AND 2200);
ALTER TABLE aeams.equipment_images ADD CONSTRAINT image_size CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  ADD CONSTRAINT image_type CHECK (content_type IN ('image/jpeg','image/png','image/webp'));
CREATE UNIQUE INDEX equipment_one_primary_image ON aeams.equipment_images(equipment_id) WHERE is_primary;
ALTER TABLE aeams.farmer_references ADD CONSTRAINT farmer_source CHECK (source IN ('FFRMS','LOCAL_FALLBACK','MOCK')),
  ADD CONSTRAINT farmer_demo CHECK (source <> 'MOCK' OR is_demo),
  ADD CONSTRAINT farmer_verification_window CHECK (valid_until > verified_at),
  ADD CONSTRAINT farmer_fallback_authority CHECK (source <> 'LOCAL_FALLBACK' OR (fallback_authorized_by IS NOT NULL AND length(trim(fallback_reason)) > 0));
ALTER TABLE aeams.reservations ADD CONSTRAINT reservation_status CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','FULFILLED','EXPIRED')),
  ADD CONSTRAINT reservation_dates CHECK (ends_at > starts_at),
  ADD CONSTRAINT reservation_approval CHECK (status NOT IN ('APPROVED','FULFILLED') OR approved_by IS NOT NULL),
  ADD CONSTRAINT reservation_rejection CHECK (status <> 'REJECTED' OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0));
ALTER TABLE aeams.borrowing_transactions ADD CONSTRAINT borrowing_status CHECK (status IN ('REQUESTED','APPROVED','RELEASED','RETURNED','OVERDUE','CANCELLED')),
  ADD CONSTRAINT borrowing_dates CHECK (expected_return_at > starts_at),
  ADD CONSTRAINT borrowing_approval CHECK (status NOT IN ('APPROVED','RELEASED','OVERDUE','RETURNED') OR approved_by IS NOT NULL),
  ADD CONSTRAINT borrowing_release CHECK (status NOT IN ('RELEASED','OVERDUE','RETURNED') OR
    (released_by IS NOT NULL AND released_at IS NOT NULL AND release_condition IS NOT NULL AND release_condition IN ('EXCELLENT','GOOD','FAIR'))),
  ADD CONSTRAINT borrowing_release_deadline CHECK (released_at IS NULL OR (released_at >= starts_at AND released_at < expected_return_at));
CREATE UNIQUE INDEX one_active_borrowing_per_equipment ON aeams.borrowing_transactions(equipment_id) WHERE status IN ('RELEASED','OVERDUE');
ALTER TABLE aeams.equipment_inspections ADD CONSTRAINT inspection_condition CHECK (condition IN ('EXCELLENT','GOOD','FAIR','DAMAGED','UNSERVICEABLE')),
  ADD CONSTRAINT inspection_damage_details CHECK (condition NOT IN ('DAMAGED','UNSERVICEABLE') OR (damage_description IS NOT NULL AND length(trim(damage_description)) > 0));
ALTER TABLE aeams.maintenance_schedules ADD CONSTRAINT schedule_interval CHECK (interval_days > 0);
ALTER TABLE aeams.maintenance_work_orders ADD CONSTRAINT maintenance_status CHECK (status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
  ADD CONSTRAINT maintenance_type CHECK (type IN ('PREVENTIVE','CORRECTIVE')),
  ADD CONSTRAINT maintenance_priority CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  ADD CONSTRAINT maintenance_dates CHECK (ends_at > starts_at),
  ADD CONSTRAINT maintenance_cost CHECK (estimated_cost >= 0),
  ADD CONSTRAINT maintenance_completion CHECK (status <> 'COMPLETED' OR (completed_at IS NOT NULL AND completed_at >= starts_at));
ALTER TABLE aeams.maintenance_records ADD CONSTRAINT maintenance_actual_cost CHECK (actual_cost >= 0);
ALTER TABLE aeams.utilization_logs ADD CONSTRAINT utilization_positive CHECK (operating_hours >= 0 AND area_hectares >= 0);
ALTER TABLE aeams.damage_reports ADD CONSTRAINT damage_severity CHECK (severity IN ('MINOR','MODERATE','SEVERE'));
ALTER TABLE aeams.integration_connections ADD CONSTRAINT integration_module CHECK (module IN ('FFRMS','APMS','AISMS','AASMS','ABPMS')),
  ADD CONSTRAINT integration_mode CHECK (mode IN ('MOCK','DISABLED','LIVE')),
  ADD CONSTRAINT integration_live_config CHECK (mode <> 'LIVE' OR (base_url IS NOT NULL AND base_url LIKE 'https://%' AND secret_env_key IS NOT NULL)),
  ADD CONSTRAINT integration_timeouts CHECK (timeout_ms BETWEEN 100 AND 60000 AND max_retries BETWEEN 0 AND 10);
ALTER TABLE aeams.integration_events ADD CONSTRAINT event_status CHECK (status IN ('RECEIVED','PROCESSED','FAILED')),
  ADD CONSTRAINT event_module CHECK (module IN ('FFRMS','APMS','AISMS','AASMS','ABPMS'));
ALTER TABLE aeams.integration_outbox ADD CONSTRAINT outbox_status CHECK (status IN ('PENDING','PROCESSING','PUBLISHED','FAILED')),
  ADD CONSTRAINT outbox_attempts CHECK (attempts >= 0),
  ADD CONSTRAINT outbox_published CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
  ADD CONSTRAINT outbox_lease CHECK (status <> 'PROCESSING' OR (locked_by IS NOT NULL AND locked_until IS NOT NULL)),
  ADD CONSTRAINT outbox_target CHECK (target_module IN ('FFRMS','APMS','AISMS','AASMS','ABPMS'));
ALTER TABLE aeams.equipment_bookings ADD CONSTRAINT booking_source CHECK (source_type IN ('RESERVATION','BORROWING','MAINTENANCE')),
  ADD CONSTRAINT booking_dates CHECK (ends_at IS NULL OR ends_at > starts_at),
  ADD CONSTRAINT equipment_booking_no_overlap EXCLUDE USING gist
    (equipment_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&);

-- Scalar actor references intentionally avoid dozens of duplicate ORM navigation fields.
DO $$
DECLARE item text[];
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ['equipment','responsible_user_id'], ['farmer_references','fallback_authorized_by'],
    ['reservations','requested_by'], ['reservations','approved_by'],
    ['borrowing_transactions','requested_by'], ['borrowing_transactions','approved_by'], ['borrowing_transactions','released_by'],
    ['equipment_inspections','inspector_id'], ['return_transactions','received_by'],
    ['maintenance_work_orders','assigned_to'], ['maintenance_records','technician_id'], ['utilization_logs','recorded_by'], ['audit_logs','actor_id']
  ] LOOP
    EXECUTE format('ALTER TABLE aeams.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES aeams.users(id) ON DELETE RESTRICT', item[1], item[1] || '_' || item[2] || '_fkey', item[2]);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON aeams.%I (%I)', item[1] || '_' || item[2] || '_idx', item[1], item[2]);
  END LOOP;
END $$;

CREATE FUNCTION aeams.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema = 'aeams' AND column_name = 'updated_at' LOOP
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON aeams.%I FOR EACH ROW EXECUTE FUNCTION aeams.touch_updated_at()', t.table_name);
  END LOOP;
END $$;

CREATE FUNCTION aeams.guard_operational_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, aeams, public AS $$
DECLARE asset aeams.equipment; farmer aeams.farmer_references; prior_status text; linked aeams.reservations;
BEGIN
  -- All workflow changes for a unit serialize on its equipment row.
  SELECT * INTO STRICT asset FROM aeams.equipment WHERE id = NEW.equipment_id FOR UPDATE;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.equipment_id <> OLD.equipment_id THEN RAISE EXCEPTION 'Equipment reference is immutable' USING ERRCODE = '23514'; END IF;
    prior_status := OLD.status;
  END IF;
  IF TG_TABLE_NAME IN ('reservations','borrowing_transactions') THEN
    IF TG_OP = 'UPDATE' AND (NEW.farmer_id <> OLD.farmer_id OR NEW.requested_by <> OLD.requested_by) THEN
      RAISE EXCEPTION 'Borrower identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' OR (NEW.status <> prior_status AND NEW.status IN ('APPROVED','RELEASED')) THEN
      IF asset.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Archived equipment cannot receive requests' USING ERRCODE = '23514'; END IF;
      SELECT * INTO STRICT farmer FROM aeams.farmer_references WHERE id = NEW.farmer_id;
      IF farmer.archived_at IS NOT NULL OR farmer.verified_at IS NULL OR farmer.verified_at > now()
        OR farmer.valid_until IS NULL OR farmer.valid_until <= now() THEN
        RAISE EXCEPTION 'Borrower reference must have a current verification' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.status IN ('APPROVED','RELEASED') AND asset.condition IN ('DAMAGED','UNSERVICEABLE') THEN
      RAISE EXCEPTION 'Equipment condition prevents approval or release' USING ERRCODE = '23514';
    END IF;
  ELSIF asset.archived_at IS NOT NULL AND NEW.status IN ('SCHEDULED','IN_PROGRESS') THEN
    RAISE EXCEPTION 'Archived equipment cannot receive maintenance bookings' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF (TG_TABLE_NAME = 'reservations' AND NEW.status <> 'PENDING')
      OR (TG_TABLE_NAME = 'borrowing_transactions' AND NEW.status <> 'REQUESTED')
      OR (TG_TABLE_NAME = 'maintenance_work_orders' AND NEW.status <> 'SCHEDULED') THEN
      RAISE EXCEPTION 'Create records in their initial workflow state' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.status <> prior_status THEN
    IF NOT (
      (TG_TABLE_NAME = 'reservations' AND ((prior_status = 'PENDING' AND NEW.status IN ('APPROVED','REJECTED','CANCELLED','EXPIRED')) OR (prior_status = 'APPROVED' AND NEW.status IN ('FULFILLED','CANCELLED','EXPIRED')))) OR
      (TG_TABLE_NAME = 'borrowing_transactions' AND ((prior_status = 'REQUESTED' AND NEW.status IN ('APPROVED','CANCELLED')) OR (prior_status = 'APPROVED' AND NEW.status IN ('RELEASED','CANCELLED')) OR (prior_status = 'RELEASED' AND NEW.status IN ('OVERDUE','RETURNED')) OR (prior_status = 'OVERDUE' AND NEW.status = 'RETURNED'))) OR
      (TG_TABLE_NAME = 'maintenance_work_orders' AND ((prior_status = 'SCHEDULED' AND NEW.status IN ('IN_PROGRESS','CANCELLED')) OR (prior_status = 'IN_PROGRESS' AND NEW.status IN ('COMPLETED','CANCELLED'))))
    ) THEN RAISE EXCEPTION 'Invalid workflow transition: % -> %', prior_status, NEW.status USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND prior_status NOT IN ('PENDING','REQUESTED','SCHEDULED') THEN
    IF NEW.starts_at <> OLD.starts_at OR
      (TG_TABLE_NAME <> 'borrowing_transactions' AND to_jsonb(NEW)->>'ends_at' IS DISTINCT FROM to_jsonb(OLD)->>'ends_at') OR
      (TG_TABLE_NAME = 'borrowing_transactions' AND to_jsonb(NEW)->>'expected_return_at' IS DISTINCT FROM to_jsonb(OLD)->>'expected_return_at') THEN
      RAISE EXCEPTION 'Committed workflow dates are immutable; cancel and create a new request' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'borrowing_transactions' THEN
    IF TG_OP = 'UPDATE' AND NEW.reservation_id IS DISTINCT FROM OLD.reservation_id THEN
      RAISE EXCEPTION 'Reservation reference is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.released_at IS NOT NULL AND
      (NEW.released_at IS DISTINCT FROM OLD.released_at OR NEW.released_by IS DISTINCT FROM OLD.released_by OR NEW.release_condition IS DISTINCT FROM OLD.release_condition) THEN
      RAISE EXCEPTION 'Release inspection evidence is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.reservation_id IS NOT NULL AND NEW.status IN ('REQUESTED','APPROVED','RELEASED') THEN
      SELECT * INTO STRICT linked FROM aeams.reservations WHERE id = NEW.reservation_id FOR UPDATE;
      IF linked.equipment_id <> NEW.equipment_id OR linked.farmer_id <> NEW.farmer_id
        OR NEW.starts_at < linked.starts_at OR NEW.expected_return_at > linked.ends_at
        OR linked.status NOT IN ('APPROVED','FULFILLED') THEN
        RAISE EXCEPTION 'Borrowing must match an approved reservation and its dates' USING ERRCODE = '23514';
      END IF;
      IF NEW.status = 'APPROVED' AND linked.status = 'APPROVED' THEN
        UPDATE aeams.reservations SET status = 'FULFILLED' WHERE id = linked.id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION aeams.sync_equipment_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, aeams, public AS $$
DECLARE kind text; active_booking boolean; finish timestamptz;
BEGIN
  CASE TG_TABLE_NAME
  WHEN 'reservations' THEN kind := 'RESERVATION'; active_booking := NEW.status = 'APPROVED'; finish := NEW.ends_at;
  WHEN 'borrowing_transactions' THEN kind := 'BORROWING'; active_booking := NEW.status IN ('APPROVED','RELEASED','OVERDUE');
    finish := CASE WHEN NEW.status = 'APPROVED' THEN NEW.expected_return_at ELSE NULL END;
  WHEN 'maintenance_work_orders' THEN kind := 'MAINTENANCE'; active_booking := NEW.status IN ('SCHEDULED','IN_PROGRESS');
    finish := CASE WHEN NEW.status = 'SCHEDULED' THEN NEW.ends_at ELSE NULL END;
  END CASE;
  DELETE FROM aeams.equipment_bookings WHERE source_id = NEW.id;
  IF active_booking THEN
    INSERT INTO aeams.equipment_bookings(equipment_id, source_type, source_id, starts_at, ends_at)
      VALUES (NEW.equipment_id, kind, NEW.id, NEW.starts_at, finish);
  END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['reservations','borrowing_transactions','maintenance_work_orders'] LOOP
    EXECUTE format('CREATE TRIGGER operational_guard BEFORE INSERT OR UPDATE ON aeams.%I FOR EACH ROW EXECUTE FUNCTION aeams.guard_operational_record()', t);
    EXECUTE format('CREATE TRIGGER booking_projection AFTER INSERT OR UPDATE ON aeams.%I FOR EACH ROW EXECUTE FUNCTION aeams.sync_equipment_booking()', t);
  END LOOP;
END $$;

CREATE FUNCTION aeams.guard_equipment_archive() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, aeams AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL AND EXISTS (SELECT 1 FROM aeams.equipment_bookings WHERE equipment_id = NEW.id) THEN
    RAISE EXCEPTION 'Equipment with committed bookings cannot be archived' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER equipment_archive_guard BEFORE UPDATE ON aeams.equipment FOR EACH ROW EXECUTE FUNCTION aeams.guard_equipment_archive();

CREATE FUNCTION aeams.guard_inspection() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, aeams AS $$
DECLARE loan aeams.borrowing_transactions;
BEGIN
  SELECT * INTO STRICT loan FROM aeams.borrowing_transactions WHERE id = NEW.borrowing_id;
  IF loan.equipment_id <> NEW.equipment_id OR loan.status NOT IN ('RELEASED','OVERDUE') OR NEW.inspected_at < loan.released_at THEN
    RAISE EXCEPTION 'Inspection must reference the released equipment and follow release' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inspection_guard BEFORE INSERT ON aeams.equipment_inspections FOR EACH ROW EXECUTE FUNCTION aeams.guard_inspection();

CREATE FUNCTION aeams.process_return() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, aeams, public AS $$
DECLARE loan aeams.borrowing_transactions; inspection aeams.equipment_inspections; unit_id uuid;
BEGIN
  SELECT equipment_id INTO STRICT unit_id FROM aeams.borrowing_transactions WHERE id = NEW.borrowing_id;
  PERFORM 1 FROM aeams.equipment WHERE id = unit_id FOR UPDATE;
  SELECT * INTO STRICT loan FROM aeams.borrowing_transactions WHERE id = NEW.borrowing_id FOR UPDATE;
  SELECT * INTO STRICT inspection FROM aeams.equipment_inspections WHERE id = NEW.inspection_id;
  IF loan.status NOT IN ('RELEASED','OVERDUE') OR inspection.borrowing_id <> loan.id OR inspection.equipment_id <> loan.equipment_id
    OR NEW.returned_at < loan.released_at OR inspection.inspected_at < NEW.returned_at THEN
    RAISE EXCEPTION 'Return requires a matching inspection after actual return and release' USING ERRCODE = '23514';
  END IF;
  UPDATE aeams.borrowing_transactions SET status = 'RETURNED' WHERE id = loan.id;
  UPDATE aeams.equipment SET condition = CASE
    WHEN nullif(trim(inspection.damage_description), '') IS NOT NULL OR nullif(trim(inspection.missing_accessories), '') IS NOT NULL THEN 'DAMAGED'
    ELSE inspection.condition END WHERE id = loan.equipment_id;
  RETURN NEW;
END $$;
CREATE TRIGGER process_equipment_return BEFORE INSERT ON aeams.return_transactions FOR EACH ROW EXECUTE FUNCTION aeams.process_return();

CREATE FUNCTION aeams.require_workflow_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, aeams AS $$
BEGIN
  IF TG_TABLE_NAME = 'borrowing_transactions' AND NEW.status = 'RETURNED' AND NOT EXISTS
    (SELECT 1 FROM aeams.return_transactions WHERE borrowing_id = NEW.id) THEN
    RAISE EXCEPTION 'Returned borrowing requires an inspection-backed return transaction' USING ERRCODE = '23514';
  ELSIF TG_TABLE_NAME = 'reservations' AND NEW.status = 'FULFILLED' AND NOT EXISTS
    (SELECT 1 FROM aeams.borrowing_transactions WHERE reservation_id = NEW.id AND status IN ('APPROVED','RELEASED','OVERDUE','RETURNED','CANCELLED')) THEN
    RAISE EXCEPTION 'Fulfilled reservation requires a linked borrowing' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER returned_evidence AFTER INSERT OR UPDATE ON aeams.borrowing_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION aeams.require_workflow_evidence();
CREATE CONSTRAINT TRIGGER fulfilled_evidence AFTER INSERT OR UPDATE ON aeams.reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION aeams.require_workflow_evidence();

CREATE FUNCTION aeams.deny_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical records cannot be changed or deleted; use archive or a new corrective record' USING ERRCODE = '23514'; END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['equipment','reservations','borrowing_transactions','maintenance_work_orders','maintenance_records','equipment_inspections','return_transactions','utilization_logs','damage_reports'] LOOP
    EXECUTE format('CREATE TRIGGER prevent_history_delete BEFORE DELETE ON aeams.%I FOR EACH ROW EXECUTE FUNCTION aeams.deny_history_mutation()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['equipment_inspections','return_transactions','audit_logs','maintenance_records'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON aeams.%I FOR EACH ROW EXECUTE FUNCTION aeams.deny_history_mutation()', t);
  END LOOP;
END $$;

CREATE FUNCTION aeams.record_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, aeams AS $$
DECLARE actor text; old_status text; entity uuid; new_status text; snapshot jsonb;
BEGIN
  actor := nullif(current_setting('aeams.actor_id', true), '');
  IF TG_OP IN ('UPDATE','DELETE') THEN old_status := to_jsonb(OLD)->>'status'; END IF;
  IF TG_OP = 'DELETE' THEN entity := OLD.id; snapshot := to_jsonb(OLD);
  ELSE entity := NEW.id; snapshot := to_jsonb(NEW); new_status := snapshot->>'status'; END IF;
  INSERT INTO aeams.audit_logs(actor_id, action, table_name, entity_id, request_id, metadata)
  VALUES (actor::uuid, TG_OP, TG_TABLE_NAME, entity, nullif(current_setting('aeams.request_id', true), ''),
    jsonb_strip_nulls(jsonb_build_object('status', new_status, 'previous_status', old_status,
      'user_id', snapshot->>'user_id', 'role_id', snapshot->>'role_id', 'permission_id', snapshot->>'permission_id')));
  RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','user_roles','role_permissions','equipment','reservations','borrowing_transactions','return_transactions','equipment_inspections','maintenance_work_orders','maintenance_records','farmer_references','integration_connections'] LOOP
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON aeams.%I FOR EACH ROW EXECUTE FUNCTION aeams.record_audit()', t);
  END LOOP;
END $$;

CREATE VIEW aeams.equipment_availability AS
SELECT e.id, e.asset_code, e.name, e.condition, e.archived_at,
  CASE WHEN e.archived_at IS NOT NULL THEN 'ARCHIVED'
    WHEN e.condition IN ('DAMAGED','UNSERVICEABLE') THEN 'UNAVAILABLE'
    WHEN EXISTS (SELECT 1 FROM aeams.borrowing_transactions b WHERE b.equipment_id = e.id AND b.status IN ('RELEASED','OVERDUE')) THEN 'BORROWED'
    WHEN EXISTS (SELECT 1 FROM aeams.equipment_bookings b WHERE b.equipment_id = e.id AND b.source_type = 'MAINTENANCE' AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now())) THEN 'UNDER_MAINTENANCE'
    WHEN EXISTS (SELECT 1 FROM aeams.equipment_bookings b WHERE b.equipment_id = e.id AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now())) THEN 'RESERVED'
    ELSE 'AVAILABLE' END AS availability
FROM aeams.equipment e;
CREATE VIEW aeams.overdue_borrowings AS
SELECT b.* FROM aeams.borrowing_transactions b WHERE b.status IN ('RELEASED','OVERDUE') AND b.expected_return_at < now();
CREATE VIEW aeams.dashboard_summary AS
SELECT (SELECT count(*) FROM aeams.equipment WHERE archived_at IS NULL) AS total_equipment,
  count(*) FILTER (WHERE availability = 'AVAILABLE') AS available_equipment,
  count(*) FILTER (WHERE availability = 'BORROWED') AS borrowed_equipment,
  count(*) FILTER (WHERE availability = 'RESERVED') AS reserved_equipment,
  count(*) FILTER (WHERE availability = 'UNDER_MAINTENANCE') AS under_maintenance,
  (SELECT count(*) FROM aeams.overdue_borrowings) AS overdue_equipment,
  (SELECT count(*) FROM aeams.reservations WHERE status = 'PENDING') + (SELECT count(*) FROM aeams.borrowing_transactions WHERE status = 'REQUESTED') AS pending_requests,
  (SELECT count(*) FROM aeams.maintenance_schedules WHERE active AND next_due_at >= now() AND next_due_at < now() + interval '30 days') AS upcoming_maintenance
FROM aeams.equipment_availability;

-- No PUBLIC access to security-definer functions, including on shared infrastructure.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA aeams FROM PUBLIC;
