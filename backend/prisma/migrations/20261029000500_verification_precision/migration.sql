-- Use wall clock and one millisecond of tolerance for timestamptz(3) rounding.
CREATE OR REPLACE FUNCTION aeams.guard_operational_record() RETURNS trigger
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
      IF farmer.archived_at IS NOT NULL OR farmer.verified_at IS NULL OR farmer.verified_at > clock_timestamp() + interval '1 millisecond'
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

