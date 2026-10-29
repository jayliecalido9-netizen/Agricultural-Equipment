# Verification record

Checks executed on 29 October 2026 with Node.js 22, Windows PowerShell, Docker Desktop Linux containers and PostgreSQL 17.6.

| Check | Result |
| --- | --- |
| Prisma schema validation and client generation | Passed |
| Backend TypeScript build | Passed |
| Frontend TypeScript/Vite production build | Passed |
| Root TypeScript checking | Passed |
| Embedded PostgreSQL migrations, constraints, fixtures and permissions | 34 tests passed |
| Real PostgreSQL Express API workflows with restricted application login | 15 workflow subtests passed |
| Independent-connection concurrent approval test | Passed; second approval waits for lock and fails with an exclusion conflict |
| Frontend, API and migration tooling Docker builds | Passed |
| Full Compose startup and service health | PostgreSQL, backend and frontend healthy |
| Restricted runtime connection/privilege check | Passed; 27 AEAMS tables |
| Browser workflow | Passed: login, equipment create/edit/archive, reservation approve/cancel, borrowing approve/release/immediate inspected return |
| Browser navigation | All 16 primary operational/administration routes verified |
| Mobile layout/navigation | Passed at 390px width; no dashboard page overflow |
| Production Docker frontend browser verification | Passed |
| Binary database backup | Created successfully by PowerShell script |
| PostgreSQL restart persistence | Passed; equipment and all operational record counts retained |
| Backup restoration | Passed in a separate temporary drill database, then removed |
| API recovery after database restart | Passed |
| Packaged upload and photo persistence | Passed through Nginx; image bytes retained across an API restart |

Screenshots: `test-results/dashboard.png`, `test-results/equipment.png`, `test-results/mobile.png` (ignored artifacts). Charts use database values and were visually inspected after disabling animation during initial rendering. The production build has a non-failing JavaScript chunk-size advisory; splitting chart/react chunks is configured.

API coverage includes missing/wrong login, CSRF header rejection, privileged-route rejection for farmers, no password-hash responses, equipment edits/search/filtering, authenticated image validation/serving, reservation conflicts, borrowing approval/release, duplicate borrowing rejection, damaged return/usage/outbox, assigned maintenance completion, personal notifications, deduplicated reminders, report/CSV/PDF generation, receipts, mock connection honesty, credential-free integration URLs, user deactivation, password-change session revocation and logout.

The database suite separately verifies archived equipment, current borrower verification, local fallback authorization, approval evidence, adjacent bookings, linked-reservation handoff, immutable inspection/return/release history, unavailable damaged assets, unbounded active equipment windows and protected audit/projection privileges.

Browser workflow QA creates a clearly named fictional verification asset, cancelled reservation and inspected borrowing/return, then archives that asset. Its immutable transaction history remains in the development database. API/concurrency suites use disposable, uniquely named databases and never reset the application database.

## Limits

No other AgriConnect service has been configured or verified as live. Actual farmer synchronization, agreed module operation endpoints and remote outbox delivery remain integration work. HTTPS/reverse-proxy deployment configuration is now supplied in `docker-compose.production.yml`; public hosting/certificate issuance still requires a real server/domain. Multiple-replica rate limiting, external security review, malware scanning, and municipality-specific retention/privacy acceptance have not been claimed as completed.

The older `Backup-Database.ps1` covers PostgreSQL only. `npm run backup` now captures matching PostgreSQL and equipment-photo archives with a checksum manifest; `npm run backup:verify -- backups/aeams-TIMESTAMP` restores into an isolated drill database and checks every referenced photo. Keep secret/role recovery information separately. A database restart drill is also available with `npx tsx scripts/check-persistence.ts` after the older database-only backup.

## Two-role update (30 October 2026)
The current model uses only Admin and Employee. Database tests verify the supported-role check, one-role-per-account constraint, and upgrade preservation of equipment and old borrower transaction references. API tests verify Employee operations and Admin-only approvals, user management, integrations, and audit access. The two-role browser check is scripts/check-two-roles.ts.

## Deployment preparation (30 October 2026)

Verified the backend and frontend production builds, 34 database tests, 16 isolated API workflow/security subtests, one real PostgreSQL concurrency/privilege test, and three deployment-security tests. Production tests cover secure HTTP-only cookies, exact HTTPS origin configuration, proxy-aware sign-in throttling, forwarding-header spoof resistance, and oversized JSON/upload handling. The dependency audit reports zero vulnerabilities with the checked-in lockfile. Patched Prisma configuration dependencies are explicitly overridden while preserving the existing Prisma 6 database interface.

The merged production Compose configuration was checked to ensure only the HTTPS gateway publishes ports, development seeding is disabled, and secure cookies/two proxy hops are configured. Caddy validated its configuration in a disposable container. The production environment generator and preflight passed using an isolated fixture directory. A coordinated database/photo backup was restored into a separate drill database, with checksums and every photo reference verified. These checks do not claim public DNS/certificate issuance or live remote module connectivity.

Final container packaging initially encountered a full C: drive and Docker snapshot extraction I/O errors. Recovery relocated the offline Docker disk to `D:\AgriConnect-AEAMS-DockerData` after verifying identical SHA-256 checksums, preserving its original path through a junction. Docker restarted successfully and the updated containers built and became healthy. A verified pre-build database/photo backup is available in ignored `backups/` and a matching recovery copy on D:.

After recovery, browser verification passed login, equipment create/edit/archive, reservation approval/cancellation, borrowing approval/release/inspected return, all 16 application routes, and mobile navigation without horizontal overflow. Both Admin and Employee logins and their permissions were verified. The live browser title is **Agricultural Equipment and Asset Management System**. Current output screenshots include `test-results/login.png`, `test-results/dashboard.png`, `test-results/equipment.png`, and `test-results/mobile.png`.
