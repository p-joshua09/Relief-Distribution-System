const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {Client}=require('pg');
const {execFile}=require('node:child_process');
const run=require('node:util').promisify(execFile);
function controlRun(file,args){return new Promise((resolve,reject)=>{const child=require('node:child_process').spawn(file,args,{windowsHide:true,stdio:'ignore'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('PostgreSQL control command failed. Check postgres.log in the local database directory.')));});}
(async()=>{
  const root=path.resolve(__dirname,'..');
  await fs.mkdir(path.join(root,'.local'),{recursive:true});
  const settingsPath=path.join(root,'.local','postgres-settings.json');
  let settings;
  try{settings=JSON.parse(await fs.readFile(settingsPath,'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;settings={user:'relief',password:randomBytes(24).toString('hex'),port:55432};await fs.writeFile(settingsPath,JSON.stringify(settings),{flag:'wx'});}
  const home=path.resolve(process.env.LOCAL_POSTGRES_HOME||settings.home||path.join(root,'.local','postgres'));
  settings.home=home;await fs.writeFile(settingsPath,JSON.stringify(settings));
  let stopDatabase;
  if(process.platform==='win32'){
    if(/[^\x00-\x7f]/.test(home))throw new Error('Windows PostgreSQL needs an ASCII directory. Set LOCAL_POSTGRES_HOME to a durable directory outside the Unicode workspace.');
    const native=await import('@embedded-postgres/windows-x64');
    const binaries=path.join(home,'runtime-18.4'),directory=path.join(home,'data');
    await fs.mkdir(home,{recursive:true});
    try{await fs.access(path.join(binaries,'bin','postgres.exe'));}catch{await fs.cp(path.dirname(path.dirname(native.postgres)),binaries,{recursive:true});}
    const initdb=path.join(binaries,'bin','initdb.exe'),control=path.join(binaries,'bin','pg_ctl.exe');
    try{await fs.access(path.join(directory,'PG_VERSION'));}catch{
      const passwordFile=path.join(home,'init-password');
      await fs.writeFile(passwordFile,settings.password+'\n',{mode:0o600});
      try{await run(initdb,['-D',directory,'--auth=scram-sha-256','--username='+settings.user,'--pwfile='+passwordFile,'--encoding=UTF8','--locale=C'],{windowsHide:true});}
      finally{await fs.unlink(passwordFile).catch(()=>{});}
    }
    let running=true;try{await controlRun(control,['-D',directory,'status']);}catch{running=false;}
    if(!running)await controlRun(control,['-D',directory,'-l',path.join(home,'postgres.log'),'-o',`-p ${settings.port} -h 127.0.0.1`,'-w','start']);
    stopDatabase=()=>controlRun(control,['-D',directory,'-m','fast','-w','stop']);
  }else{
    const {default:EmbeddedPostgres}=await import('embedded-postgres');
    const directory=path.join(home,'data');
    const pg=new EmbeddedPostgres({databaseDir:directory,...settings,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1'],onLog:()=>{}});
    try{await fs.access(path.join(directory,'PG_VERSION'));}catch{await pg.initialise();}
    await pg.start();stopDatabase=()=>pg.stop();
  }
  const connection=`postgresql://${settings.user}:${settings.password}@127.0.0.1:${settings.port}/postgres`;
  const client=new Client({connectionString:connection});await client.connect();
  if(!(await client.query("SELECT 1 FROM pg_database WHERE datname='relief_distribution'")).rowCount)await client.query('CREATE DATABASE relief_distribution');
  await client.end();
  const envPath=path.join(root,'.env');
  try{await fs.access(envPath);}catch{await fs.writeFile(envPath,`DATABASE_URL=${connection.replace(/\/postgres$/,'/relief_distribution')}\nHOST=127.0.0.1\nPORT=8765\nCOOKIE_SECURE=false\n`,{flag:'wx'});}
  console.log('Project PostgreSQL is running on 127.0.0.1:55432. In another terminal, run npm start.');
  const stop=async()=>{await stopDatabase();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
  setInterval(()=>{},60000);
})().catch(error=>{console.error(error.message);process.exit(1);});
