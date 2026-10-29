import 'dotenv/config';
import pg from 'pg';

async function main() {
  if (!process.env.APP_DATABASE_URL) throw new Error('Set APP_DATABASE_URL first.');
  const client = new pg.Client({ connectionString: process.env.APP_DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const result = await client.query(`SELECT current_database() AS database, current_user AS role,
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'aeams' AND table_type = 'BASE TABLE') AS tables,
      has_schema_privilege(current_user, 'aeams', 'CREATE') AS can_create_in_aeams,
      has_table_privilege(current_user, 'aeams.audit_logs', 'UPDATE') AS can_update_audit,
      has_table_privilege(current_user, 'aeams.equipment_bookings', 'INSERT') AS can_insert_booking`);
    const state = result.rows[0];
    if (state.role !== 'aeams_app' || state.can_create_in_aeams || state.can_update_audit || state.can_insert_booking || state.tables < 26) {
      throw new Error('Schema or runtime privilege verification failed.');
    }
    console.log('Database connection and runtime privilege checks passed:', state);
    console.log('Live dashboard:', (await client.query('SELECT * FROM aeams.dashboard_summary')).rows[0]);
  } finally { await client.end(); }
}
main().catch(() => { console.error('Database check failed. Verify Docker health, migrations, and APP_DATABASE_URL. No credentials were logged.'); process.exitCode = 1; });
