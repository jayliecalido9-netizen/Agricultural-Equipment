import 'dotenv/config';
import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  JWT_SECRET: z.string().min(48),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  COOKIE_SECURE: z.enum(['true','false']).default('false'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(1),
  UPLOAD_DIRECTORY: z.string().default('uploads'),
  NOTIFICATION_INTERVAL_MS: z.coerce.number().int().min(1000).default(60000)
});
export type AppConfig = z.infer<typeof configSchema>;
export function validateDeploymentConfig(config:AppConfig): AppConfig {
  const origin=new URL(config.FRONTEND_ORIGIN);
  if (origin.origin!==config.FRONTEND_ORIGIN || origin.username || origin.password) throw new Error('FRONTEND_ORIGIN must be an exact origin without a path, credentials, or trailing slash.');
  if (config.NODE_ENV==='production') {
    if (config.COOKIE_SECURE!=='true' || origin.protocol!=='https:') throw new Error('Production requires an HTTPS FRONTEND_ORIGIN and COOKIE_SECURE=true.');
    if (new Set(config.JWT_SECRET).size<12 || /replace|example|change.me|test.only/i.test(config.JWT_SECRET)) throw new Error('Production requires a randomly generated JWT_SECRET.');
  }
  return config;
}
export function loadConfig(): AppConfig {
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid server configuration: ${parsed.error.issues.map(i=>i.path.join('.')).join(', ')}. Run scripts/Initialize-Application.ps1.`);
  return validateDeploymentConfig(parsed.data);
}
