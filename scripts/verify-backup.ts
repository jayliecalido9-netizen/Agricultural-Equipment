import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checksum,composeArgs,docker } from './backup-application.js';

async function main(){
  const argument=process.argv.slice(2).find(value=>!value.startsWith('--'));
  if(!argument)throw new Error('Usage: npm run backup:verify -- backups/aeams-TIMESTAMP [--production]');
  const directory=path.resolve(argument),compose=composeArgs(process.argv.includes('--production'));
  const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')) as {format:number;files:Record<string,string>};
  if(manifest.format!==1)throw new Error('Unsupported backup format.');
  for(const name of ['database.dump','uploads.tar.gz'])if(await checksum(path.join(directory,name))!==manifest.files[name])throw new Error(`Backup checksum failed for ${name}.`);
  const database=`aeams_restore_${randomUUID().replaceAll('-','')}`,containerFile=`/tmp/${database}.dump`;
  if(!/^aeams_restore_[a-f0-9]{32}$/.test(database))throw new Error('Invalid drill database name.');
  let created=false,copied=false;
  try{
    await docker([...compose,'exec','-T','db','createdb','-U','postgres',database]);created=true;
    await docker([...compose,'cp',path.join(directory,'database.dump'),`db:${containerFile}`]);copied=true;
    await docker([...compose,'exec','-T','db','pg_restore','-U','postgres','--exit-on-error',`--dbname=${database}`,containerFile]);
    const keys=await docker([...compose,'exec','-T','db','psql','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1','-c','SELECT storage_key FROM aeams.equipment_images ORDER BY storage_key']);
    const archive=await docker([...compose,'run','--rm','--no-deps','-T','--entrypoint','tar','backend','-tzf','-'],path.join(directory,'uploads.tar.gz'));
    const entries=new Set(archive.split(/\r?\n/).map(name=>name.replace(/^\.\//,'')));
    for(const key of keys.split(/\r?\n/).filter(Boolean))if(!entries.has(key))throw new Error('A photo referenced by the restored database is missing from the upload archive.');
    await docker([...compose,'exec','-T','db','psql','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1','-c','SELECT count(*) FROM aeams.equipment; SELECT count(*) FROM aeams.borrowing_transactions;']);
    console.log('Verified both archive checksums, database restoration, operational tables, and every referenced photo. Live records were preserved.');
  }finally{
    if(created)await docker([...compose,'exec','-T','db','dropdb','-U','postgres','--force',database]);
    if(copied)await docker([...compose,'exec','-T','db','rm','--',containerFile]);
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Backup verification failed.');process.exitCode=1;});
