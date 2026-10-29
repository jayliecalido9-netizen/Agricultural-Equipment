import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
if(!process.env.APP_DATABASE_URL||!process.env.POSTGRES_ADMIN_PASSWORD)throw new Error('Configure and start the local PostgreSQL database first.');
const url=new URL(process.env.APP_DATABASE_URL);url.username='postgres';url.password=process.env.POSTGRES_ADMIN_PASSWORD;
const child=spawn(process.execPath,[path.resolve('node_modules/tsx/dist/cli.mjs'),'--test','backend/tests/postgres.integration.test.ts'],{stdio:'inherit',env:{...process.env,POSTGRES_TEST_ADMIN_URL:url.toString()}});
child.on('exit',code=>{process.exitCode=code||0;});
