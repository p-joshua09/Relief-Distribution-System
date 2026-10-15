const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {createPool,migrate,transaction}=require('./database.cjs');
const d=require('./domain.cjs');
const ROOT=path.resolve(__dirname,'..');
async function bodyOf(req) {
  if(!String(req.headers['content-type']||'').startsWith('application/json')) d.fail(415,'Send requests as JSON.');
  let size=0;const parts=[];
  for await(const part of req) {size+=part.length;if(size>256000)d.fail(413,'Request is too large.');parts.push(part);}
  try{return JSON.parse(Buffer.concat(parts).toString()||'{}');}catch{d.fail(400,'Invalid JSON request.');}
}
function createApp(pool,{secureCookie=process.env.COOKIE_SECURE==='true'}={}) {
  const attempts=new Map();
  const server=http.createServer(async(req,res)=>{
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url=new URL(req.url,'http://localhost');
      if(!url.pathname.startsWith('/api/')) {
        if(!['GET','HEAD'].includes(req.method))d.fail(405,'Method not allowed.');
        const name=decodeURIComponent(url.pathname);
        if(name.split('/').some(part=>part==='..'||part==='.'))d.fail(404,'Not found.');
        const page=['/','/index.html','/registration','/verification'].includes(name);
        if(!page && !/^\/assets\/(?:js|css|branding)\/[a-zA-Z0-9._/-]+$/.test(name))d.fail(404,'Not found.');
        const file=path.resolve(ROOT,`.${page?'/index.html':name}`);
        if(!file.startsWith(`${ROOT}${path.sep}`))d.fail(404,'Not found.');
        if(!page && !file.startsWith(path.join(ROOT,'assets')+path.sep))d.fail(404,'Not found.');
        const content=await fs.readFile(file);
        const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
        res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);return;
      }
      if(!['GET','POST','PUT','DELETE'].includes(req.method))d.fail(405,'Method not allowed.');
      if(req.method!=='GET' && req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)d.fail(403,'Request origin is not allowed.');
      const token=/(?:^|;\s*)relief_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
      const session=token?(await pool.query('SELECT s.*,u.username,u.full_name,u.staff_number FROM sessions s JOIN staff u ON u.id=s.staff_id WHERE token_hash=$1 AND expires_at>now()',[d.digest(token)])).rows[0]:null;
      const user=session?d.publicStaff({...session,id:session.staff_id}):null;
      if(url.pathname==='/api/session' && req.method==='GET') {
        send(200,{user,csrfToken:session?.csrf_token||null,setupRequired:!(await pool.query('SELECT 1 FROM staff LIMIT 1')).rowCount});return;
      }
      if(url.pathname==='/api/setup' && req.method==='POST') {
        if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))d.fail(403,'Create the first staff account on the computer running this server.');
        const body=await bodyOf(req);
        const created=await transaction(pool,async client=>{
          await client.query("SELECT pg_advisory_xact_lock(hashtext('relief-initial-staff'))");
          if((await client.query('SELECT 1 FROM staff LIMIT 1')).rowCount)d.fail(409,'Setup is complete. Sign in to create additional staff accounts.');
          const person=await d.createStaff(client,body);await d.audit(client,person,'Initial staff account created');return person;
        });send(201,{user:created});return;
      }
      if(url.pathname==='/api/login' && req.method==='POST') {
        const body=await bodyOf(req),username=String(body.username||'').trim().toLowerCase();
        const key=d.digest(`${req.socket.remoteAddress}|${username}`),now=Date.now();
        for(const [entry,value]of attempts)if(value.until<now)attempts.delete(entry);
        const limit=attempts.get(key);
        if(limit?.count>=10 && limit.until>now)d.fail(429,'Too many sign-in attempts. Try again in 15 minutes.');
        const staff=(await pool.query('SELECT * FROM staff WHERE username=$1',[username])).rows[0];
        if(!await d.checkPassword(body.password,staff?.password_hash)){
          attempts.set(key,{count:(limit?.count||0)+1,until:now+15*60*1000});d.fail(401,'Incorrect username or password.');
        }
        attempts.delete(key);
        const sessionToken=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
        await transaction(pool,async client=>{
          await client.query('DELETE FROM sessions WHERE expires_at<now()');
          if(token)await client.query('DELETE FROM sessions WHERE token_hash=$1',[d.digest(token)]);
          await client.query("INSERT INTO sessions(token_hash,staff_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[d.digest(sessionToken),staff.id,csrf]);
          await d.audit(client,d.publicStaff(staff),'Staff signed in');
        });
        res.setHeader('Set-Cookie',`relief_session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookie?'; Secure':''}`);
        send(200,{user:d.publicStaff(staff),csrfToken:csrf});return;
      }
      if(!user)d.fail(401,'Sign in to continue.');
      if(req.method!=='GET' && req.headers['x-csrf-token']!==session.csrf_token)d.fail(403,'Your session changed. Reload and try again.');
      const body=req.method==='GET'?{}:await bodyOf(req);
      let result,status=200,match;
      if(url.pathname==='/api/logout' && req.method==='POST'){
        await transaction(pool,async client=>{await client.query('DELETE FROM sessions WHERE token_hash=$1',[session.token_hash]);await d.audit(client,user,'Staff signed out');});
        res.setHeader('Set-Cookie',`relief_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie?'; Secure':''}`);result={ok:true};
      } else if(url.pathname==='/api/workspace' && req.method==='GET')result=await d.workspace(pool,user);
      else if(url.pathname==='/api/staff' && req.method==='POST'){result=await transaction(pool,async client=>{const created=await d.createStaff(client,body);await d.audit(client,user,'Staff account created',null,{staffId:created.id});return created;});status=201;}
      else if(url.pathname==='/api/verification' && req.method==='POST'){result=await d.verify(pool,user,body);status=201;}
      else if(url.pathname==='/api/beneficiaries' && req.method==='POST'){result=await d.saveProfile(pool,user,body);status=201;}
      else if((match=/^\/api\/beneficiaries\/([^/]+)$/.exec(url.pathname)) && req.method==='PUT')result=await d.saveProfile(pool,user,body,decodeURIComponent(match[1]));
      else if((match=/^\/api\/beneficiaries\/([^/]+)$/.exec(url.pathname)) && req.method==='GET'){
        const id=decodeURIComponent(match[1]);
        result=await transaction(pool,async client=>{const record=(await d.beneficiaries(client)).find(p=>p.id===id);if(!record)d.fail(404,'Beneficiary not found.');await d.audit(client,user,'Beneficiary profile and claim history viewed',id);return {record,claims:(await d.claims(client)).filter(c=>c.recordId===id)};});
      } else if(url.pathname==='/api/assessments' && req.method==='POST')result=await d.assess(pool,user,body);
      else if((match=/^\/api\/assessments\/([^/]+)\/confirm$/.exec(url.pathname)) && req.method==='POST')result=await d.confirmAssessment(pool,user,match[1]);
      else if(url.pathname==='/api/releases' && req.method==='POST'){result=await d.reserve(pool,user,body);status=201;}
      else if((match=/^\/api\/releases\/([^/]+)\/complete$/.exec(url.pathname)) && req.method==='POST')result=await d.complete(pool,user,match[1],body);
      else if((match=/^\/api\/releases\/([^/]+)\/cancel$/.exec(url.pathname)) && req.method==='POST')result=await d.cancel(pool,user,match[1],body);
      else if((match=/^\/api\/receipts\/([^/]+)$/.exec(url.pathname)) && req.method==='GET'){
        result=(await d.claims(pool)).find(c=>c.receipt===decodeURIComponent(match[1]));if(!result)d.fail(404,'Receipt not found.');await d.audit(pool,user,'Saved receipt retrieved',result.recordId,{receipt:result.receipt});
      } else if(url.pathname==='/api/batch' && req.method==='PUT'){
        if(!['active','paused','closed'].includes(body.status))d.fail(422,'Select a valid batch status.');
        const amount=body.incomeLimit===null || body.incomeLimit===''?null:Number(body.incomeLimit);
        if(amount!==null && (!Number.isFinite(amount)||amount<0||amount>1e12))d.fail(422,'Enter a valid income limit.');
        result=await transaction(pool,async client=>{
          const old=(await client.query('SELECT * FROM batches WHERE id=$1 FOR UPDATE',[d.BATCH_ID])).rows[0];
          if(body.version!==old.version)d.fail(409,'Batch settings changed at another counter. Reload before saving.');
          const activity=body.activity===undefined?old.activity:d.text(body.activity,200);
          const label=body.label===undefined?old.label:d.text(body.label,100);
          const row=(await client.query('UPDATE batches SET status=$1,income_limit=$2,activity=$3,label=$4,version=version+1 WHERE id=$5 RETURNING *',[body.status,amount,activity,label,d.BATCH_ID])).rows[0];
          await d.audit(client,user,'Batch settings updated',null,{previous:old,current:row});return row;
        });
      } else if(url.pathname==='/api/audit' && req.method==='POST'){
        const allowed=new Set(['Capture failure','Profile confirmed','Match rejected','Verification restarted','Claim history exported','Claim history viewed','Beneficiary directory viewed','Intake cleared','Declined handover']);
        if(!allowed.has(body.action))d.fail(422,'Unsupported audit event.');
        await d.audit(pool,user,body.action,body.recordId||null,{note:d.text(body.note||'',500,false)});result={ok:true};
      } else if(url.pathname==='/api/draft' && req.method==='PUT'){
        await pool.query('INSERT INTO staff_drafts(staff_id,data) VALUES($1,$2) ON CONFLICT(staff_id) DO UPDATE SET data=EXCLUDED.data,updated_at=now()',[user.id,body]);result={ok:true};
      } else if(url.pathname==='/api/draft' && req.method==='DELETE'){await pool.query('DELETE FROM staff_drafts WHERE staff_id=$1',[user.id]);result={ok:true};}
      else d.fail(404,'Endpoint not found.');
      send(status,result);
    }catch(error){
      let status=error.status||503,message=error.status?error.message:'The database is unavailable. Your entries are kept; retry when the connection returns.';
      if(error.code==='23505'){status=409;message='This record, staff identity, or batch claim already exists.';}
      if(error.code==='22P02'||error.code==='23514'||error.code==='23503'){status=422;message='Some information is invalid or refers to a record that no longer exists.';}
      if(error.code==='ENOENT'){status=404;message='Not found.';}
      if(!error.status && !['23505','22P02','23514','23503','ENOENT'].includes(error.code))console.error('Request failed:',error.code||error.name);
      if(!res.headersSent)send(status,{error:message,...(error.details||{})});else res.end();
    }
  });
  return server;
}
async function start(){const pool=createPool();await migrate(pool);const server=createApp(pool);server.listen(Number(process.env.PORT||8765),process.env.HOST||'127.0.0.1',()=>console.log(`Relief distribution is ready at http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||8765}`));const stop=()=>server.close(()=>pool.end().then(()=>process.exit(0)));process.on('SIGTERM',stop);process.on('SIGINT',stop);}
if(require.main===module)start().catch(error=>{console.error(error.message);process.exit(1);});
module.exports={createApp};
