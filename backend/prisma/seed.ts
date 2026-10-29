import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedReferenceData, seedDemoData, ensureDemoAccounts, type SeedDatabase } from './seed-data.js';

async function main() {
  const referenceOnly = process.argv.includes('--reference-only');
  if (!referenceOnly && (process.env.ALLOW_DEMO_SEED !== 'true' || process.env.NODE_ENV === 'production')) {
    throw new Error('Demo seed requires ALLOW_DEMO_SEED=true and a non-production environment. Use db:bootstrap for reference data only.');
  }
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async tx => {
      // Seed operations are idempotent and serialized across parallel invocations.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(51005)::text`;
      const db: SeedDatabase = { query: async (sql, params = []) => {
        // Identifiers and SQL come only from the checked-in seed; values stay bound.
        const typedSql=sql.replace(/\$(\d+)(?!\d)/g,(placeholder,index)=>
          typeof params[Number(index)-1]==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(params[Number(index)-1])) ? `${placeholder}::uuid` : placeholder);
        const rows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(typedSql, ...params);
        return { rows };
      } };
      await seedReferenceData(db);
      if (!referenceOnly) {
        const created = await seedDemoData(db, process.env.DEMO_ADMIN_EMAIL || 'admin@example.test', process.env.DEMO_ADMIN_PASSWORD || '');
        await ensureDemoAccounts(db,process.env.DEMO_ADMIN_PASSWORD||'');
        console.log(created ? 'Installed fictional demo fixtures.' : 'Demo fixtures already exist; no changes made.');
      }
    }, { timeout: 60000 });
    console.log('Reference roles, permissions, and integration settings are ready.');
  } finally { await prisma.$disconnect(); }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error && error.message.startsWith('Demo seed requires') ? error.message : 'Seeding failed. Check credentials, password length, and database migrations.');
  process.exitCode = 1;
});
