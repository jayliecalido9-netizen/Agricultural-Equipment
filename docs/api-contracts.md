# API v1 contracts

Base: `/api/v1`. Swagger: `/api-docs/`. OpenAPI JSON: `/api/v1/openapi.json`.

All mutation requests require `X-AEAMS-Request: 1`. Use JSON except for image uploads. Login sets an HTTP-only JWT cookie; Axios sends cookies through the same-origin Vite/Nginx proxy. JWTs have a fixed issuer/audience and two-hour expiry. Current account activity, authentication version, roles and permissions are read from PostgreSQL on every protected request.

Success: `{ "data": ... }`. Paginated lists also return `pagination: { total, page, limit, pages }`. Lists accept `page`, `limit` (1–100), `search`, `sort=asc|desc` (creation-time ordering), plus resource-specific filters. Errors: `{ "error": { "message": "...", "request_id": "...", "fields": { ... } } }`; `fields` is present for field-validation failures.

Use UUIDs for local IDs and ISO 8601 timestamps with offsets for instants. Acquisition dates use `YYYY-MM-DD`. Money is in PHP; decimals may serialize as strings.

## Authentication and references

| Endpoint | Body / behavior |
| --- | --- |
| POST `/auth/login` | `email`, `password` |
| GET `/auth/me` | Current identity, roles and permission codes; no hash or token |
| POST `/auth/logout` | Revoke all account sessions |
| POST `/auth/password` | `current_password`, `new_password` (16–128 characters); revoke sessions |
| GET `/lookups` | Categories, locations, permitted farmer references, authorized personnel/roles, minimal equipment catalog |
| GET `/health` | Public, database-backed service check |

## Equipment

GET `/equipment` supports `category_id`, `status`, `archived=true|false`. GET `/equipment/:id` includes equipment details and operational history for Admin and Employee.

POST `/equipment` requires `asset_code`, `name`, `category_id`, `location_id`. Optional: `description`, `brand`, `model`, `serial_number`, `acquisition_date`, `acquisition_cost`, `condition`, `maintenance_interval_days`, `funding_source`, `assigned_office`, `notes`. PATCH `/:id` accepts a subset. POST `/:id/archive` requires no committed bookings.

POST `/:id/images` accepts multipart `image`, at most 5 MB, with JPEG/PNG/WebP magic-byte validation. Server-generated file names prevent path traversal. GET `/images/:id` requires authentication. SVG and arbitrary file types are rejected. Uploaded photos are stored in the private persistent volume; they are not exposed through a public static directory.

POST `/categories`: `name`, optional `description`. POST `/locations`: `code`, `name`, optional `description`.

GET `/equipment/availability` takes `starts_at`, `ends_at` and checks the full window. GET `/calendar` accepts the same window and optional `equipment_id`; it returns committed equipment windows without borrower identities.

## Reservations

POST `/reservations`: `equipment_id`, `farmer_id`, future `starts_at`, `ends_at`, `purpose`, `usage_location`; optional `farm_reference`. Admin and Employee select verified farmer references for external borrowers; there is no farmer login role.

POST `/reservations/:id/approve`, `/reject` (requires `reason`), `/cancel`. Approval requires `reservation.approve`; only Admin has this approval permission. Canonical statuses: `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `FULFILLED`, `EXPIRED`. The UI displays Fulfilled as Completed.

## Borrowing, release and returns

POST `/borrowings`: `equipment_id`, `farmer_id`, `starts_at`, `expected_return_at`, `purpose`; optional `reservation_id`, `farm_reference`, `notes`. Linked reservations must match unit, farmer and contained dates.

POST `/borrowings/:id/approve`, `/reject` (`reason`), `/cancel`, `/release` (`condition`), `/return`. Approval requires `borrowing.approve`; release requires `borrowing.release` and a usable condition. Release must occur during the approved window. The server sets actors, codes and release time.

Return fields: `returned_at`, `condition`; optional `damage_description`, `missing_accessories`, `notes`, `operating_hours`, `area_hectares`. Damage/unserviceable condition requires damage notes. The server creates a matching inspection and closes the loan in one transaction. Damage or missing accessories keeps the unit unavailable. Optional utilization and an APMS outbox event commit with the return.

Statuses: `REQUESTED`, `APPROVED`, `RELEASED`, `RETURNED`, `OVERDUE`, `CANCELLED`. UI labels Requested as Pending and Released as Borrowed. Rejection stores Cancelled plus an explicit `Rejected:` reason. GET `/borrowings?status=active` selects active loans; `status=overdue` also checks actual deadlines.

GET `/borrowings/:id/receipt` returns a printable borrowing PDF. Add `type=return` for an inspected return receipt or `format=json` for receipt data. Admin and Employee may retrieve transaction receipts.

## Maintenance

POST `/maintenance`: `equipment_id`, `type` (`PREVENTIVE`/`CORRECTIVE`), `description`, `assigned_to`, `starts_at`, `ends_at`; optional `priority`, `estimated_cost`, `schedule_id`. Admin and Employee may create and process operational work orders. Assignees must be active and maintenance-authorized.

POST `/maintenance/:id/start`, `/cancel`, `/complete`. Completion requires `repair_notes`, `actual_cost`, `condition`; optional `material_issue_reference`, `procurement_reference`. The server records repairs and explicitly updates the assessed equipment condition. Linked recurring due dates advance by their interval.

GET/POST `/maintenance-schedules` handles recurring plans. POST requires `equipment_id`, `title`, `interval_days`, `next_due_at`. PATCH `/:id` accepts `active`, `next_due_at`. Admin and Employee may configure recurrence and process work orders.

## Reports and analytics

GET `/dashboard` returns the shared operational dashboard for Admin and Employee. GET `/utilization` accepts `from`, `to`, `category_id`; default window is 30 days. Utilization is elapsed borrowed hours divided by eligible hours in the window, excluding time before acquisition. Logged operating hours are separately totaled for returns in that window. Actual in-progress/completed work contributes to maintenance downtime; cancelled work does not.

GET `/reports/:report`: `inventory`, `availability`, `conditions`, `borrowings`, `returns`, `overdue`, `maintenance`, `utilization`. Filters: `from`, `to`, `category_id`, `status`; `format=json|csv|pdf`. Inventory/availability date filters use registration time, condition reports use asset update time, and transaction reports use their event/request dates. Exports reject queries beyond 5,000 rows rather than truncating. CSV protects spreadsheet-formula prefixes. Print/PDF reports include AgriConnect/MAO identification.

## Notifications and administration

GET `/notifications`; POST `/notifications/:id/read`, `/notifications/read-all`. These are personal. POST `/notifications/refresh` requires settings management. The minute scheduler expires ended reservations, marks overdue released loans and generates deduplicated return/maintenance alerts for requestors, linked borrower accounts and authorized staff.

GET `/farmers` requires farmer-reference permission. POST `/farmers/fallback` requires user management: `external_farmer_id`, `display_name`, optional `barangay_reference`, plus `reason` and `valid_until` within 90 days. This is an audited local authorization, not official FFRMS registration.

GET/POST `/users`, PATCH `/users/:id` require user management. Creation: `email`, `display_name`, `password`, `role_ids` containing exactly one Admin or Employee role; optional `active`. Administrators cannot disable/demote themselves or remove the last active administrator. Only Admin may create accounts and change role assignments. Edits revoke sessions; hashes are never returned.

GET `/audit-logs` requires `audit.read`. GET `/settings` returns office information; PATCH requires `settings.manage` and `name`, `system_name`, `timezone=Asia/Manila`. Credentials are not settings-page fields.

GET `/integrations` returns status and outbox counts. PATCH `/integrations/:module`: `mode`, `base_url`, `api_version`, `timeout_ms`, `max_retries`. POST `/:module/test` verifies a configured live module or explicitly reports Mock. Tokens come from backend environment variables, never request bodies or browser code.

## Errors

400 invalid JSON; 401 absent/expired/revoked session; 403 missing permission or invalid request origin/header; 404 missing/ownership-hidden record; 409 duplicate code, booking/condition/workflow conflict or unsafe archive; 422 validation/reference failure; 429 rate limit; 502 failed external health verification. Public errors omit raw SQL, parameters, credentials and stack traces. Database constraints decide concurrent approval outcomes.
