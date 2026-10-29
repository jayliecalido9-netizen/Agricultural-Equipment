# Admin and Employee permissions

AEAMS has exactly two application roles: **Admin** and **Employee**. Each account holds one role. PostgreSQL checks supported role codes and rejects multiple role assignments for an account. The backend loads the current role/permissions on every request, and frontend navigation follows those permissions.

| Capability | Admin | Employee |
| --- | --- | --- |
| Equipment inventory, details, registration, editing and archiving | Yes | Yes |
| Farmer-reference directory | Yes | Yes |
| Create/cancel reservations and borrowing requests for farmers | Yes | Yes |
| Approve or reject reservations | Yes | No |
| Approve or reject borrowing requests | Yes | No |
| Record authorized equipment releases and inspected returns | Yes | Yes |
| Maintenance work orders and recurring plans | Yes | Yes |
| Availability, calendars, utilization and reports | Yes | Yes |
| Personal notifications and own password change | Yes | Yes |
| Create/edit accounts and assign Admin/Employee roles | Yes | No |
| Authorize local farmer-reference fallback | Yes | No |
| Configure/test ERP integrations | Yes | No |
| View audit logs | Yes | No |
| Change organization settings or manually refresh reminders | Yes | No |

Admin receives all 16 permission codes. Employee receives `equipment.read`, `equipment.write`, `reservation.request`, `borrowing.request`, `borrowing.release`, `return.record`, `maintenance.read`, `maintenance.write`, `report.read`, and `farmer.read`.

Farmers/borrowers are external transaction participants, not application login roles. Both staff roles select a verified farmer reference when creating a request. Admin and Employee can view shared operational information. Account management and approval endpoints remain protected on the backend; hiding a button is not the security boundary.

The migration preserves account UUIDs and transaction references, maps existing staff to Admin/Employee, revokes existing sessions, and retains older fictional demo identities as inactive history. Borrower-only portal accounts are disabled during migration so retiring that role does not grant staff access. New demo installations create only `admin@example.test` and `employee@example.test`.

Administrators cannot deactivate/demote themselves or remove the last active Admin. Password/role/activity changes revoke sessions. Active accounts are shown by default in Users & Roles; inactive historical accounts remain available through the account filter. User/role assignment changes are audited and operational history remains protected.
