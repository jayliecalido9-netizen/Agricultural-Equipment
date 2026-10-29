import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

// Runtime requests use the restricted application login, never the migration login.
export function createDatabase() {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL is required.');
  return new PrismaClient({ datasources: { db: { url: process.env.APP_DATABASE_URL } } });
}

// Routes authenticate and authorize actorId before calling this helper.
// SET LOCAL keeps context on this transaction's connection, with no pool leakage.
export async function withActor<T>(db: PrismaClient, actorId: string, requestId: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId)) throw new Error('Actor must be a UUID.');
  if (!requestId || requestId.length > 200) throw new Error('A request ID of at most 200 characters is required.');
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('aeams.actor_id', ${actorId}, true), set_config('aeams.request_id', ${requestId}, true)`;
    return operation(tx);
  });
}
