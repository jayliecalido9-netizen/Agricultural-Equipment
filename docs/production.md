# Production deployment

This release supports one Docker host and one API instance. The public entry point is Caddy on ports 80/443. Caddy forwards to Nginx, which serves React and proxies the API. PostgreSQL, the API, and Nginx have no published ports in the production configuration. The local development installation remains separate.

## Prepare a fresh server

Install Docker Engine with Compose 2.24.4 or later, Node.js 22.12+ for administration scripts, and PowerShell if using the provided setup commands. Point a real domain's DNS A/AAAA records to the server and allow inbound TCP 80/443; UDP 443 is optional. Remove incorrect AAAA records if the server has no working IPv6 route. Caddy obtains and renews certificates after public DNS and firewall access work. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https/) and [Compose merge rules](https://docs.docker.com/reference/compose-file/merge/).

Leave at least 10 GB free on the drive containing Docker's data disk before building/upgrading; allow additional capacity for database growth and retained backups. Database administration and migration services share one image to avoid keeping duplicate tool images. On Docker Desktop, the data disk may be on C: even when the checkout is on another drive. Use Docker Desktop's supported disk-location setting if relocating it; do not manually move an active Docker data disk.

Copy the source and lockfile to a fresh server. Do not copy development `.env`, demonstration credentials, local `node_modules` links, or development volumes. Install administration dependencies:

```powershell
npm ci
npm run db:generate
.\scripts\Initialize-Production.ps1 -Domain 'equipment.YOUR-DOMAIN.gov.ph' -CertificateEmail 'YOUR-CERTIFICATE-CONTACT@YOUR-DOMAIN.gov.ph'
npm run deploy:check
.\scripts\Start-Production.ps1
```

Replace both example values with your own domain and contact email. Initialization creates a separate, ignored `.env.production` containing independent random database and session secrets. It refuses to overwrite an existing file. Restrict this file to the deployment operator and store an encrypted recovery copy outside the server. For Linux without PowerShell, create the same keys shown by `Initialize-Production.ps1` in a protected `.env.production`, using a different random 48-byte hexadecimal value for each secret, then run `npm run deploy:check`.

Equivalent container startup on either platform:

```sh
docker compose -p aeams-production --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml config --quiet
docker compose -p aeams-production --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml up -d --build --wait --wait-timeout 240
docker compose -p aeams-production --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml --profile tools run --build --rm db-tools npm run db:check
```

Always use the same `-p`, environment file, and both Compose files for production operations. Project `aeams-production` has its own database/photo/certificate volumes. This intentionally does not attach to this workstation's `agriconnect` volumes. Check for conflicting exported environment variables before deploying; shell variables override Compose environment files. Never run demo seeding in production.

## Create the first Admin

The production database starts with reference roles/settings and no users or fictional transactions. In PowerShell on the server:

```powershell
$env:ADMIN_EMAIL = Read-Host 'Admin email'
$env:ADMIN_NAME = Read-Host 'Admin display name'
$securePassword = Read-Host 'Admin password (at least 16 characters)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  docker compose -p aeams-production --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml --profile tools run --rm -e ADMIN_EMAIL -e ADMIN_NAME -e ADMIN_PASSWORD db-tools npm run admin:create
  if ($LASTEXITCODE -ne 0) { throw 'Administrator creation failed.' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Item Env:ADMIN_EMAIL,Env:ADMIN_NAME,Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
```

Sign in at your HTTPS domain. Create Employee accounts in Users & Roles. Add office details, locations, equipment categories, and equipment. For standalone operations, an Admin can add an explicitly authorized farmer reference with a reason and verification expiry in Farmer References. Employees can then select it for requests. Remote farmer synchronization requires the FFRMS contract; this system does not invent remote records.

## Verify the release

```sh
npm run typecheck
npm test
npm run test:deployment
npm run build
npm audit --audit-level=high
```

The API and concurrency suites additionally require a local **development** PostgreSQL installation and disposable database creation privileges. Run them before promotion, not against the live database. `.github/workflows/verify.yml` automates builds, security audit, isolated tests, Docker startup, and browser workflow checks when the repository is hosted on GitHub. This workspace has no Git remote configured; the workflow has been supplied for your repository.

Confirm HTTPS, login/logout for both roles, inventory, a reservation approval, a borrowing/release/inspected return, maintenance completion, CSV/PDF exports, and photo uploads. Inspect `/healthz` for database-backed readiness. A healthy local build cannot validate public DNS or a public certificate before a server/domain exists.

Proxy trust is exactly two hops in production: API ← Nginx ← Caddy. Nginx appends the upstream address; Caddy replaces untrusted client-forwarding headers. Keep the internal services private and change/retest the trust setting if this topology changes. Single-process in-memory throttling is intentional; introduce a shared rate-limit store before adding API replicas.

## Back up and recover

```sh
npm run backup -- --production
npm run backup:verify -- backups/aeams-TIMESTAMP --production
```

Use the actual directory printed by the backup command. Backup briefly pauses the API, takes a binary custom-format database dump and a compressed photo archive, then resumes the API even if a step fails. The manifest is written only after both files succeed and contains SHA-256 hashes. The restore drill validates both hashes, restores only into its own uniquely named `aeams_restore_*` database, checks operational tables and verifies every database photo reference exists in the archive. It removes only its own drill database and temporary dump.

Protect backups as sensitive data. Schedule them daily in the server's task scheduler/cron, copy completed directories off the server to encrypted storage, alert on nonzero exit status, and run periodic restore drills. Maintain `.env.production` and database-role recovery information separately; neither is included in the archive. Caddy can reissue certificates if its certificate volume is lost.

For disaster recovery, provision matching roles on a replacement cluster using the saved production environment, then restore the database and uploads into a replacement installation while the API is stopped. Validate the replacement before changing DNS. Do not restore over the live installation or discard the original volumes. Importing existing development records is a separate data migration; review fictional fixtures, user credentials, and privacy before promoting those records.

## Updates and operations

Take and verify a backup before upgrades. Build a tested release and apply forward Prisma migrations through the migration service; do not use `db push`. Reverting application images does not reverse schema migrations. Keep previous release images and ensure any application rollback is compatible with the migrated schema.

```sh
docker compose -p aeams-production --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml ps
docker compose -p aeams-production --env-file .env.production -f docker-compose.yml -f docker-compose.production.yml logs --tail 100 backend frontend gateway
```

Container logs rotate at 10 MB with five files per service. Monitor disk/volume capacity, health checks, backup failures, and certificate renewals. Restrict SSH/RDP to operators. Keep Docker host/images patched and record image digests for each approved release. Never use `down --volumes` on retained data.

External AgriConnect synchronization/outbox delivery remains disabled until the respective teams supply working services and agree their contracts. The standalone AEAMS workflows operate through authorized local farmer references. Actual public hosting, external integrations, load testing for a specified staff count, and organizational access/retention approval require the real deployment environment.
