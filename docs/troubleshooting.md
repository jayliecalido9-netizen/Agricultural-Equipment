# Local login connection troubleshooting

If the login page says the server is unavailable, first inspect service health:

```powershell
docker compose ps -a
docker compose logs --tail 30 db-migrate backend
npx tsx scripts/diagnose-connection.ts
```

`P1000`/`28P01` indicates database authentication failed. Changing database password fields in `.env` does not change accounts in an existing PostgreSQL volume. Website login passwords belong to application users and are separate from PostgreSQL credentials.

When the original local `DATABASE_URL` and `APP_DATABASE_URL` still authenticate but their separate password fields were edited, the local recovery helper can preserve the working role credentials, reconcile `.env`, and recover the internal DBA credential if necessary:

```powershell
npx tsx scripts/repair-local-configuration.ts
docker compose up -d --wait
npx tsx scripts/check-login.ts
```

This helper refuses remote databases and requires the existing role connection URLs to authenticate. It does not reset equipment or transaction records. Do not delete the database volume to resolve a password mismatch.

If service health passes but a fictional demo account no longer matches `DEMO_ADMIN_PASSWORD`, the separate development-only reset command requires explicit opt-in. It targets only the known fictional fixture identities and refuses production mode:

```powershell
$env:ALLOW_DEMO_PASSWORD_RESET = 'true'
npx tsx scripts/reset-demo-logins.ts
Remove-Item Env:ALLOW_DEMO_PASSWORD_RESET
npx tsx scripts/check-login.ts
```

The reset preserves a valid configured demo password, or generates a new one if it does not meet the minimum length. Read the current value from `.env`; no passwords are printed. Normal non-demo accounts should be managed through the authorized Users & Roles password-reset workflow.

The Nginx proxy uses Docker DNS to re-resolve recreated API containers. Its `/healthz` endpoint checks actual API/database health instead of serving an unconditional success. After updating the proxy source, rebuild and start the frontend:

```powershell
docker compose build frontend
docker compose up -d --wait frontend
```

Reference: [NGINX upstream DNS resolution](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#resolve).
