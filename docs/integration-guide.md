# AgriConnect data integration contract

The five external modules are unconfigured. Reference bootstrap initializes `DISABLED` connections; fictional demo bootstrap labels them `MOCK`. The API implements explicit Mock/Disabled adapters and allowlisted, authenticated live health verification. Live farmer synchronization and automatic remote operation/event delivery remain disabled until contracts are agreed.

## Ownership and references

Keep one PostgreSQL database and separate schemas, credentials and migrations for each team. Use authorized versioned APIs (`/api/v1`) and domain events across module boundaries, even when every module runs on the same PostgreSQL server. Avoid direct cross-schema writes and foreign keys into another team's schema. External identifiers are opaque strings up to 200 characters, so another team's numeric or namespaced identifiers can be preserved without conversion.

`farmer_references` caches minimal borrower identity and verification metadata from FFRMS. `(source,external_farmer_id)` is unique. It is not an authoritative farmer registry. Borrowing references the local cache UUID and optionally an external farm reference. Farmer verification needs a bounded `valid_until`; agree its validity policy with FFRMS. A `LOCAL_FALLBACK` needs an authorizing local user and a reason. `MOCK` records must be marked fictional. Do not interpret a demo verification as official eligibility.

Use `external_module_references` to map local UUIDs to remote acquisition, farm, beneficiary, program and material-issuance identifiers. Its generic local entity UUID is not a polymorphic foreign key: the future integration service must validate the entity type and existence. AEAMS records material issue and procurement references without duplicating parts stock, budget ledgers, beneficiary approvals or financial workflows.

| Producer / consumer | Proposed information | Owning module |
| --- | --- | --- |
| FFRMS to AEAMS | Farmer identity, farmer verification, farm and barangay references | FFRMS |
| AEAMS to APMS | Equipment UUID, farm reference, activity dates and operating hours | AEAMS |
| AEAMS / AISMS | Material request and issue references | AISMS owns stock and issues |
| AEAMS / AASMS | Approved beneficiary/program references | AASMS owns eligibility |
| AEAMS / ABPMS | Acquisition, procurement and repair funding references; permitted costs | ABPMS owns official finance |

## Event delivery

Store outgoing events in `integration_outbox` **in the same transaction** as the associated domain update. Include an event ID, schema version, ISO timestamp, aggregate UUID, correlation ID and a stable idempotency key. The database does not automatically emit production integration events; the future service must construct approved minimal payloads.

Example proposed payload (fictional):

```json
{
  "event_type": "aeams.utilization.recorded.v1",
  "event_id": "c62ef660-8275-4cd4-9b08-e30a61fab03b",
  "equipment_id": "06464c66-e6ba-4d44-8a1d-beec428d7780",
  "farm_reference": "FFRMS-FARM-EXAMPLE",
  "operating_hours": "12.00",
  "occurred_at": "2026-10-29T08:00:00+08:00",
  "is_demo": true
}
```

A future worker should claim a bounded batch with `FOR UPDATE SKIP LOCKED`, update state to `PROCESSING`, set a worker ID and lease deadline, and commit **before** making network calls. Use bounded timeouts, exponential backoff, retry limits and lease recovery. Only mark `PUBLISHED` after acknowledged delivery. At-least-once delivery requires receiver deduplication using the idempotency key. Never hold a database transaction open while waiting on another module's HTTP response.

Incoming events are deduplicated by `(module,external_event_id)` in `integration_events`. Apply a received event and mark it processed atomically. Persist only necessary data, and define payload retention/redaction policies before live use. Foreign network failure must not silently roll back a confirmed local equipment operation; reliable delivery retries belong to the outbox worker.

## Connection settings

`integration_connections` stores mode, base URL, API version, timeout, retry policy and the **environment variable name** for a secret. Tokens belong in backend environment configuration or a secret manager. Do not store tokens in payloads, URLs, browser code or logs.

`LIVE` expresses configuration intent, not a verified connection. A future service must perform an authenticated health check and record successful verification. It must define a freshness policy and present Connected only while verification remains valid; otherwise display Unverified/Error. `verified_at` alone is insufficient to claim a currently working connection. No connection is verified by this milestone.

Coordinate these decisions before integrating: identity-provider issuer/audience and user subject format, role mapping, official farmer/farm ID formats, tenant boundaries if needed, timestamp and decimal encoding, event versioning, error format, service authentication, verification expiry, retry/idempotency handling, data retention and which fields each consuming module may see.
