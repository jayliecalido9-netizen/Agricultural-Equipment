-- The DBA/bootstrap provisions aeams and assigns ownership before migration.
-- Avoid CREATE SCHEMA here: even IF NOT EXISTS requires database CREATE rights.

-- CreateTable
CREATE TABLE "aeams"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "erp_subject" VARCHAR(200),
    "email" VARCHAR(254) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "password_hash" VARCHAR(100),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "description" VARCHAR(250) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."role_permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."equipment_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."equipment_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."equipment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "description" TEXT,
    "brand" VARCHAR(100),
    "model" VARCHAR(100),
    "serial_number" VARCHAR(150),
    "year_manufactured" INTEGER,
    "acquisition_date" DATE,
    "acquisition_cost" DECIMAL(14,2),
    "funding_source" VARCHAR(150),
    "procurement_reference" VARCHAR(200),
    "assigned_office" VARCHAR(150),
    "responsible_user_id" UUID,
    "condition" VARCHAR(30) NOT NULL DEFAULT 'GOOD',
    "maintenance_interval_days" INTEGER,
    "warranty_expires_at" DATE,
    "notes" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."equipment_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipment_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "content_type" VARCHAR(80) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "caption" VARCHAR(250),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."farmer_references" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" VARCHAR(30) NOT NULL,
    "external_farmer_id" VARCHAR(200) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "barangay_reference" VARCHAR(200),
    "verified_at" TIMESTAMPTZ(3),
    "valid_until" TIMESTAMPTZ(3),
    "fallback_authorized_by" UUID,
    "fallback_reason" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farmer_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference_code" VARCHAR(60) NOT NULL,
    "equipment_id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "farm_reference" VARCHAR(200),
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "purpose" TEXT NOT NULL,
    "usage_location" VARCHAR(250) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."borrowing_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference_code" VARCHAR(60) NOT NULL,
    "equipment_id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "reservation_id" UUID,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "released_by" UUID,
    "farm_reference" VARCHAR(200),
    "purpose" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "expected_return_at" TIMESTAMPTZ(3) NOT NULL,
    "released_at" TIMESTAMPTZ(3),
    "release_condition" VARCHAR(30),
    "status" VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "borrowing_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."equipment_inspections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipment_id" UUID NOT NULL,
    "borrowing_id" UUID NOT NULL,
    "inspector_id" UUID NOT NULL,
    "condition" VARCHAR(30) NOT NULL,
    "missing_accessories" TEXT,
    "damage_description" TEXT,
    "notes" TEXT,
    "photo_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inspected_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."return_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference_code" VARCHAR(60) NOT NULL,
    "borrowing_id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "received_by" UUID NOT NULL,
    "returned_at" TIMESTAMPTZ(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."maintenance_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipment_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "interval_days" INTEGER NOT NULL,
    "next_due_at" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."maintenance_work_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference_code" VARCHAR(60) NOT NULL,
    "equipment_id" UUID NOT NULL,
    "schedule_id" UUID,
    "assigned_to" UUID,
    "type" VARCHAR(30) NOT NULL,
    "description" TEXT NOT NULL,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "status" VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "estimated_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."maintenance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "actual_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "repair_notes" TEXT NOT NULL,
    "material_issue_reference" VARCHAR(200),
    "procurement_reference" VARCHAR(200),
    "performed_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."utilization_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "borrowing_id" UUID NOT NULL,
    "farm_reference" VARCHAR(200),
    "operating_hours" DECIMAL(10,2) NOT NULL,
    "area_hectares" DECIMAL(10,4),
    "activity" TEXT NOT NULL,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utilization_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."damage_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inspection_id" UUID NOT NULL,
    "work_order_id" UUID,
    "description" TEXT NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "damage_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "message" TEXT NOT NULL,
    "entity_id" UUID,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "action" VARCHAR(30) NOT NULL,
    "table_name" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "request_id" VARCHAR(200),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."external_module_references" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "module" VARCHAR(20) NOT NULL,
    "entity_type" VARCHAR(60) NOT NULL,
    "external_id" VARCHAR(200) NOT NULL,
    "local_entity_type" VARCHAR(60) NOT NULL,
    "local_entity_id" UUID NOT NULL,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_module_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."integration_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "module" VARCHAR(20) NOT NULL,
    "mode" VARCHAR(20) NOT NULL DEFAULT 'DISABLED',
    "base_url" VARCHAR(500),
    "api_version" VARCHAR(30) NOT NULL DEFAULT 'v1',
    "secret_env_key" VARCHAR(100),
    "timeout_ms" INTEGER NOT NULL DEFAULT 5000,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "verified_at" TIMESTAMPTZ(3),
    "last_success_at" TIMESTAMPTZ(3),
    "last_error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."integration_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "module" VARCHAR(20) NOT NULL,
    "external_event_id" VARCHAR(200) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."integration_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "target_module" VARCHAR(20) NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(100),
    "published_at" TIMESTAMPTZ(3),
    "last_error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeams"."equipment_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "equipment_id" UUID NOT NULL,
    "source_type" VARCHAR(30) NOT NULL,
    "source_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_erp_subject_key" ON "aeams"."users"("erp_subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "aeams"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "aeams"."roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "aeams"."permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "aeams"."user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "aeams"."user_roles"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "aeams"."role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "aeams"."role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_categories_name_key" ON "aeams"."equipment_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_locations_code_key" ON "aeams"."equipment_locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_asset_code_key" ON "aeams"."equipment"("asset_code");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_serial_number_key" ON "aeams"."equipment"("serial_number");

-- CreateIndex
CREATE INDEX "equipment_category_id_archived_at_idx" ON "aeams"."equipment"("category_id", "archived_at");

-- CreateIndex
CREATE INDEX "equipment_location_id_idx" ON "aeams"."equipment"("location_id");

-- CreateIndex
CREATE INDEX "equipment_responsible_user_id_idx" ON "aeams"."equipment"("responsible_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_images_storage_key_key" ON "aeams"."equipment_images"("storage_key");

-- CreateIndex
CREATE INDEX "equipment_images_equipment_id_idx" ON "aeams"."equipment_images"("equipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_references_source_external_farmer_id_key" ON "aeams"."farmer_references"("source", "external_farmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_reference_code_key" ON "aeams"."reservations"("reference_code");

-- CreateIndex
CREATE INDEX "reservations_equipment_id_starts_at_ends_at_idx" ON "aeams"."reservations"("equipment_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "reservations_status_starts_at_idx" ON "aeams"."reservations"("status", "starts_at");

-- CreateIndex
CREATE INDEX "reservations_farmer_id_idx" ON "aeams"."reservations"("farmer_id");

-- CreateIndex
CREATE INDEX "reservations_requested_by_idx" ON "aeams"."reservations"("requested_by");

-- CreateIndex
CREATE UNIQUE INDEX "borrowing_transactions_reference_code_key" ON "aeams"."borrowing_transactions"("reference_code");

-- CreateIndex
CREATE UNIQUE INDEX "borrowing_transactions_reservation_id_key" ON "aeams"."borrowing_transactions"("reservation_id");

-- CreateIndex
CREATE INDEX "borrowing_transactions_equipment_id_status_idx" ON "aeams"."borrowing_transactions"("equipment_id", "status");

-- CreateIndex
CREATE INDEX "borrowing_transactions_status_expected_return_at_idx" ON "aeams"."borrowing_transactions"("status", "expected_return_at");

-- CreateIndex
CREATE INDEX "borrowing_transactions_farmer_id_idx" ON "aeams"."borrowing_transactions"("farmer_id");

-- CreateIndex
CREATE INDEX "borrowing_transactions_requested_by_idx" ON "aeams"."borrowing_transactions"("requested_by");

-- CreateIndex
CREATE INDEX "equipment_inspections_equipment_id_inspected_at_idx" ON "aeams"."equipment_inspections"("equipment_id", "inspected_at");

-- CreateIndex
CREATE INDEX "equipment_inspections_borrowing_id_idx" ON "aeams"."equipment_inspections"("borrowing_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_transactions_reference_code_key" ON "aeams"."return_transactions"("reference_code");

-- CreateIndex
CREATE UNIQUE INDEX "return_transactions_borrowing_id_key" ON "aeams"."return_transactions"("borrowing_id");

-- CreateIndex
CREATE UNIQUE INDEX "return_transactions_inspection_id_key" ON "aeams"."return_transactions"("inspection_id");

-- CreateIndex
CREATE INDEX "maintenance_schedules_active_next_due_at_idx" ON "aeams"."maintenance_schedules"("active", "next_due_at");

-- CreateIndex
CREATE INDEX "maintenance_schedules_equipment_id_idx" ON "aeams"."maintenance_schedules"("equipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_work_orders_reference_code_key" ON "aeams"."maintenance_work_orders"("reference_code");

-- CreateIndex
CREATE INDEX "maintenance_work_orders_equipment_id_starts_at_ends_at_idx" ON "aeams"."maintenance_work_orders"("equipment_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "maintenance_work_orders_assigned_to_status_idx" ON "aeams"."maintenance_work_orders"("assigned_to", "status");

-- CreateIndex
CREATE INDEX "maintenance_work_orders_schedule_id_idx" ON "aeams"."maintenance_work_orders"("schedule_id");

-- CreateIndex
CREATE INDEX "maintenance_records_work_order_id_idx" ON "aeams"."maintenance_records"("work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "utilization_logs_borrowing_id_key" ON "aeams"."utilization_logs"("borrowing_id");

-- CreateIndex
CREATE INDEX "damage_reports_inspection_id_idx" ON "aeams"."damage_reports"("inspection_id");

-- CreateIndex
CREATE INDEX "damage_reports_work_order_id_idx" ON "aeams"."damage_reports"("work_order_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "aeams"."notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_table_name_entity_id_created_at_idx" ON "aeams"."audit_logs"("table_name", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "aeams"."audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "external_module_references_local_entity_type_local_entity_i_idx" ON "aeams"."external_module_references"("local_entity_type", "local_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_module_references_module_entity_type_external_id_l_key" ON "aeams"."external_module_references"("module", "entity_type", "external_id", "local_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_module_key" ON "aeams"."integration_connections"("module");

-- CreateIndex
CREATE INDEX "integration_events_status_created_at_idx" ON "aeams"."integration_events"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "integration_events_module_external_event_id_key" ON "aeams"."integration_events"("module", "external_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_outbox_idempotency_key_key" ON "aeams"."integration_outbox"("idempotency_key");

-- CreateIndex
CREATE INDEX "integration_outbox_status_available_at_idx" ON "aeams"."integration_outbox"("status", "available_at");

-- CreateIndex
CREATE INDEX "integration_outbox_target_module_created_at_idx" ON "aeams"."integration_outbox"("target_module", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_bookings_source_id_key" ON "aeams"."equipment_bookings"("source_id");

-- CreateIndex
CREATE INDEX "equipment_bookings_equipment_id_idx" ON "aeams"."equipment_bookings"("equipment_id");

-- AddForeignKey
ALTER TABLE "aeams"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "aeams"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "aeams"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "aeams"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "aeams"."permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."equipment" ADD CONSTRAINT "equipment_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "aeams"."equipment_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."equipment" ADD CONSTRAINT "equipment_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "aeams"."equipment_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."equipment_images" ADD CONSTRAINT "equipment_images_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "aeams"."equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."reservations" ADD CONSTRAINT "reservations_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "aeams"."equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."reservations" ADD CONSTRAINT "reservations_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "aeams"."farmer_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."borrowing_transactions" ADD CONSTRAINT "borrowing_transactions_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "aeams"."equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."borrowing_transactions" ADD CONSTRAINT "borrowing_transactions_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "aeams"."farmer_references"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."borrowing_transactions" ADD CONSTRAINT "borrowing_transactions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "aeams"."reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."equipment_inspections" ADD CONSTRAINT "equipment_inspections_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "aeams"."equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."equipment_inspections" ADD CONSTRAINT "equipment_inspections_borrowing_id_fkey" FOREIGN KEY ("borrowing_id") REFERENCES "aeams"."borrowing_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."return_transactions" ADD CONSTRAINT "return_transactions_borrowing_id_fkey" FOREIGN KEY ("borrowing_id") REFERENCES "aeams"."borrowing_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."return_transactions" ADD CONSTRAINT "return_transactions_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "aeams"."equipment_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "aeams"."equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "aeams"."equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "aeams"."maintenance_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."maintenance_records" ADD CONSTRAINT "maintenance_records_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "aeams"."maintenance_work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."utilization_logs" ADD CONSTRAINT "utilization_logs_borrowing_id_fkey" FOREIGN KEY ("borrowing_id") REFERENCES "aeams"."borrowing_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."damage_reports" ADD CONSTRAINT "damage_reports_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "aeams"."equipment_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."damage_reports" ADD CONSTRAINT "damage_reports_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "aeams"."maintenance_work_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "aeams"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeams"."equipment_bookings" ADD CONSTRAINT "equipment_bookings_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "aeams"."equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
