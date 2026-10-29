# Deployment and recovery

The executable HTTPS deployment and coordinated database/photo backups are documented in [Production deployment](production.md). The instructions below also describe the local development installation and the older database-only backup tool.

## Services and configuration

`Start-Application.ps1 -Demo` provisions configuration, runs PostgreSQL, deploys Prisma migrations/permissions, builds the API/frontend and installs fictional demonstration data. Omit `-Demo` for an empty database.

| Service | Purpose |
| --- | --- |
| `db` | PostgreSQL; persistent `agriconnect_postgres_data` volume |
| `db-migrate` | One-time migration/reference setup; successful exit is expected |
| `backend` | Express API, authorization and notification scheduler |
| `frontend` | Nginx React build and same-origin API/documentation proxy |
| `db-tools` | On-demand database tools under the tools profile |

`aeams_migrator` owns the AEAMS schema; `aeams_app` cannot create tables, mutate audit history, write the calendar projection or delete operational history. DBA initialization provisions schema ownership and `btree_gist`. Other modules need separate owners/runtime logins. A fresh database needs the DBA-provisioned `aeams` schema before the first migration.

`POSTGRES_PORT`, `FRONTEND_PORT` and `FRONTEND_ORIGIN` configure host access. Current frontend port is 3002; other pre-existing containers use 3000 and 3001. Database/API ports bind to loopback. PostgreSQL and photos have separate named volumes.

`pg_isready` checks server readiness; the API health endpoint queries PostgreSQL. `db:check` verifies restricted credentials, schema and privileges. A listening port alone does not verify migration state.

## First administrator without demo fixtures

Initialize/migrate/bootstrap first, then use a masked password prompt on the host:

```powershell
$env:ADMIN_EMAIL = Read-Host 'Administrator email'
$env:ADMIN_NAME = Read-Host 'Administrator display name'
$adminPassword = Read-Host 'Password (at least 16 characters)' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword)
try {
    $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    npm run admin:create
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    Remove-Item Env:ADMIN_PASSWORD,Env:ADMIN_EMAIL,Env:ADMIN_NAME -ErrorAction SilentlyContinue
}
```

The CLI uses the deployment credential, refuses to overwrite an existing account, and prints no password. Subsequent accounts are managed in Users & Roles.

## Live deployment

Supply HTTPS, `COOKIE_SECURE=true`, a random `JWT_SECRET`, the exact frontend origin and private database networking with verified TLS. Tokens use HTTP-only cookies with fixed issuer/audience and two-hour expiry. User activity/role/version checks run on each protected request. Mutations require a custom header and a trusted browser origin; no JWT is stored in browser local storage.

The local in-memory rate limiter supports one API process. Multiple replicas need shared limiter storage. Reminders use a database advisory lock and unique deduplication keys. Outbox delivery is not active until external module contracts exist.

Approve patched image digests/dependencies before live use. Plan PostgreSQL major upgrades rather than attaching a new major image to an old data directory. Keep migration credentials restricted to deployment. Never reset the shared database or use `db push` to deploy schema changes.

## Backup and recovery

`Backup-Database.ps1` creates a binary custom-format `pg_dump` archive in the container, then copies it to ignored `backups/`. This avoids PowerShell 5.1 corrupting binary output through text redirection. The archive covers all schemas in the configured database; coordinate access/retention with other module owners. Cluster roles/secrets and `equipment_uploads` require separate recovery arrangements.

Restore into a **separate new drill database**, never the live database:

```powershell
docker compose exec -T db createdb -U postgres agriconnect_restore_drill
docker compose cp .\backups\YOUR-BACKUP.dump db:/tmp/restore-drill.dump
docker compose exec -T db pg_restore -U postgres --exit-on-error --dbname=agriconnect_restore_drill /tmp/restore-drill.dump
docker compose exec -T db psql -U postgres -d agriconnect_restore_drill -c 'SELECT * FROM aeams.dashboard_summary;'
```

On another cluster, provision referenced roles first or intentionally map ownership/privileges. Validate assets, reservations, borrowing, inspections/returns, repairs, photos and runtime permissions. Keep off-machine backups, restore drills, storage monitoring and appropriate retention policies. This project does not claim a completed municipal operational security/privacy assessment.

## This workstation

Docker builds exhausted C: during implementation. Regenerable project dependencies are now at `D:\AgriConnect-AEAMS-DevCache\aeams-20261030-deployment\node_modules`, linked at the original project path. npm's download cache is preserved at `D:\AgriConnect-AEAMS-DevCache\npm-cache`, also linked from its original path. Frontend source files remain in the project. These are local workstation arrangements; another checkout uses ordinary `npm ci`. npm installation commands can replace the junction; check available C: space before reinstalling dependencies.

Keep D: available while using those links. Docker's build context excludes local dependencies, environment secrets, photos, backups, generated builds and test output. Build-time package downloads use a temporary memory mount to reduce disk pressure.

Docker's data disk is now stored permanently at `D:\AgriConnect-AEAMS-DockerData\docker_data.vhdx`. Its original `C:\Users\jayma\AppData\Local\Docker\wsl\disk` directory is a junction to that location. The disk was copied while Docker/WSL were stopped and both copies had matching SHA-256 checksums before removing the C: copy. This directory contains all Docker containers and volumes, including the AEAMS database and photographs; it is not a disposable development cache. Keep D: available and never remove this directory as part of cache cleanup. The startup scripts check that the Docker storage drive has at least 10 GB free before rebuilding.
