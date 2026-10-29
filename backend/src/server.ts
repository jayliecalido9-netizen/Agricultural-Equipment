import { createDatabase } from './database.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { generateReminders } from './notifications.js';

async function main() {
  const config=loadConfig(),db=createDatabase();
  await db.$connect();
  const app=createApp(db,config);
  const server=app.listen(config.PORT,'0.0.0.0',()=>console.log(JSON.stringify({level:'info',message:'AEAMS API listening',port:config.PORT})));
  server.requestTimeout=30000;
  server.headersTimeout=15000;
  const refresh=()=>generateReminders(db).catch(()=>console.error(JSON.stringify({level:'error',message:'Notification reminder check failed'})));
  void refresh();const timer=setInterval(()=>void refresh(),config.NOTIFICATION_INTERVAL_MS);timer.unref();
  let stopping=false;
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>{
    if(stopping)return;stopping=true;
    clearInterval(timer);
    const deadline=setTimeout(()=>{server.closeAllConnections();void db.$disconnect().finally(()=>process.exit(1));},25000);deadline.unref();
    server.close(()=>void db.$disconnect().finally(()=>{clearTimeout(deadline);process.exit(0);}));
  });
}
main().catch(()=>{console.error('AEAMS could not start. Verify database migrations, APP_DATABASE_URL, and JWT_SECRET.');process.exitCode=1;});
