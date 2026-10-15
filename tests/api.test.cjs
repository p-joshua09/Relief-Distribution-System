const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createPool,migrate}=require('../server/database.cjs');
const {createApp}=require('../server/index.cjs');
let admin,pool,server,base,staffA,staffB,counter=0;
const schema='test_'+randomUUID().replaceAll('-','');
const password='Integration-only-password-42';
const entitlement={rice:6,canned:4,beef:4,coffee:6,cereal:6};
async function request(route,{actor,method='GET',body,csrf=true}={}){
  const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:actor.cookie,...(csrf?{'X-CSRF-Token':actor.csrf}: {})}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
}
async function login(username){const result=await request('/api/login',{method:'POST',body:{username,password}});assert.equal(result.status,200);return {cookie:result.cookie.split(';')[0],csrf:result.data.csrfToken,user:result.data.user};}
function profile(name){return {firstName:name,lastName:'Integration',birthDate:'1990-01-02',sex:'Female',civilStatus:'Married',region:'NCR',province:'Metro Manila',address:'Test address',barangay:'Barangay 1',city:'Manila',income:'7500',incomePeriod:'monthly',householdSize:3,contact:'test@example.invalid',validId:''};}
function enrollment(){return {simulated:true,consent:true,faceCapturedAt:new Date().toISOString(),fingerprintCapturedAt:new Date().toISOString()};}
async function newPerson(extra={}){
  const verification=await request('/api/verification',{actor:staffA,method:'POST',body:{method:'simulated',consent:true,face:true,fingerprint:true}});
  assert.equal(verification.status,201);
  const p=profile('Person'+(++counter));Object.assign(p,extra);
  const saved=await request('/api/beneficiaries',{actor:staffA,method:'POST',body:{profile:p,enrollment:enrollment(),members:[],verificationId:verification.data.id}});
  assert.equal(saved.status,201,JSON.stringify(saved.data));
  return {id:saved.data.id,version:saved.data.version,verificationId:verification.data.id,profile:p};
}
async function assessment(person,actor=staffA){
  const v=await request('/api/verification',{actor,method:'POST',body:{recordId:person.id,method:'manual',consent:true,reference:'Valid-test-ID',reason:'Capture unsuccessful'}});
  assert.equal(v.status,201);
  const a=await request('/api/assessments',{actor,method:'POST',body:{recordId:person.id,verificationId:v.data.id,profileConfirmed:true}});
  assert.equal(a.status,200);if(a.data.eligible){const ready=await request(`/api/assessments/${a.data.id}/confirm`,{actor,method:'POST',body:{}});assert.equal(ready.status,200);}return a.data;
}
async function reserve(a,actor=staffA,key=randomUUID(),goods=entitlement){return request('/api/releases',{actor,method:'POST',body:{assessmentId:a.id,idempotencyKey:key,goods,varianceReason:''}});}
before(async()=>{
  admin=createPool();await admin.query(`CREATE SCHEMA "${schema}"`);
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema},public`);
  pool=createPool(url.toString());await migrate(pool);server=createApp(pool);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  const setup=await request('/api/setup',{method:'POST',body:{username:'staff-a',password,fullName:'Test Staff A',staffNumber:'TEST-A'}});assert.equal(setup.status,201);
  staffA=await login('staff-a');
  const added=await request('/api/staff',{actor:staffA,method:'POST',body:{username:'staff-b',password,fullName:'Test Staff B',staffNumber:'TEST-B'}});assert.equal(added.status,201);
  staffB=await login('staff-b');
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();if(admin){await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();}});
test('staff authentication, session protection, equal access and static-file isolation',async()=>{
  assert.equal((await request('/api/workspace')).status,401);
  assert.equal((await request('/api/draft',{actor:staffA,method:'PUT',body:{},csrf:false})).status,403);
  assert.equal((await request('/api/setup',{method:'POST',body:{}})).status,409);
  assert.equal(staffA.user.role,undefined);assert.equal(staffB.user.role,undefined);
  const res=await fetch(base+'/.env');assert.equal(res.status,404);
  const traversal=await fetch(base+'/assets/js/../../server/index.cjs');assert.equal(traversal.status,404);
  const encodedTraversal=await fetch(base+'/assets/js/..%2f..%2f.env');assert.equal(encodedTraversal.status,404);
  const encodedServer=await fetch(base+'/assets/js/..%2f..%2fserver/index.cjs');assert.equal(encodedServer.status,404);
  const stored=await pool.query('SELECT password_hash FROM staff');assert.ok(stored.rows.every(s=>!s.password_hash.includes(password)));
  assert.equal((await request('/api/login',{method:'POST',body:{username:'staff-a',password:'wrong'}})).status,401);
});
test('registration is independent of verification and has a separate reloadable page',async()=>{
  for(const page of ['/registration','/verification']) {
    const response=await fetch(base+page);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
  }
  const count=(await pool.query('SELECT count(*)::int AS count FROM verifications')).rows[0].count;
  const registrationKey=randomUUID(),body={profile:profile('Independent Registration'),enrollment:enrollment(),members:[],registrationKey};
  const registered=await request('/api/beneficiaries',{actor:staffA,method:'POST',body});assert.equal(registered.status,201);
  const replay=await request('/api/beneficiaries',{actor:staffA,method:'POST',body});assert.equal(replay.data.id,registered.data.id);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM verifications')).rows[0].count,count);
  const assessment=await request('/api/assessments',{actor:staffA,method:'POST',body:{recordId:registered.data.id,profileConfirmed:true}});assert.equal(assessment.status,422);
  const edit=await request('/api/beneficiaries/'+registered.data.id,{actor:staffA,method:'PUT',body:{profile:{...body.profile,contact:'updated@example.invalid'},members:[],version:1}});assert.equal(edit.status,200);
});
test('profile and family links save atomically; linked names follow the existing person',async()=>{
  const child=await newPerson({firstName:'LinkedChild'}),parent=await newPerson({firstName:'LinkedParent'});
  const saved=await request('/api/beneficiaries/'+parent.id,{actor:staffA,method:'PUT',body:{profile:parent.profile,version:parent.version,verificationId:parent.verificationId,members:[{name:'Incorrect submitted name',relationship:'Child',age:4,relatedBeneficiaryId:child.id}]}});
  assert.equal(saved.status,200);
  let viewed=await request('/api/beneficiaries/'+parent.id,{actor:staffB});assert.equal(viewed.data.record.members[0].name,'LinkedChild Integration');assert.equal(viewed.data.record.members[0].relatedBeneficiaryId,child.id);
  const failed=await request('/api/beneficiaries/'+parent.id,{actor:staffA,method:'PUT',body:{profile:{...parent.profile,firstName:'ShouldRollback'},version:saved.data.version,verificationId:parent.verificationId,members:[{name:'Bad link',relationship:'Child',relatedBeneficiaryId:'RL-missing'}]}});
  assert.equal(failed.status,422);
  viewed=await request('/api/beneficiaries/'+parent.id,{actor:staffB});assert.equal(viewed.data.record.firstName,'LinkedParent');assert.equal(viewed.data.record.members[0].relatedBeneficiaryId,child.id);
  const stale=await request('/api/beneficiaries/'+parent.id,{actor:staffA,method:'PUT',body:{profile:parent.profile,version:1,verificationId:parent.verificationId,members:[]}});assert.equal(stale.status,409);
  const changed=await request('/api/beneficiaries/'+child.id,{actor:staffA,method:'PUT',body:{profile:{...child.profile,firstName:'UpdatedChild'},version:1,verificationId:child.verificationId,members:[]}});assert.equal(changed.status,200);
  viewed=await request('/api/beneficiaries/'+parent.id,{actor:staffB});assert.equal(viewed.data.record.members[0].name,'UpdatedChild Integration');
});
test('duplicate identity review requires a reason, not another account approval',async()=>{
  const p=await newPerson();
  const v=(await request('/api/verification',{actor:staffB,method:'POST',body:{method:'simulated',consent:true,face:true,fingerprint:true}})).data;
  const duplicate=await request('/api/beneficiaries',{actor:staffB,method:'POST',body:{profile:p.profile,enrollment:enrollment(),members:[],verificationId:v.id}});assert.equal(duplicate.status,409);assert.equal(duplicate.data.duplicateId,p.id);
  const distinct=await request('/api/beneficiaries',{actor:staffB,method:'POST',body:{profile:p.profile,enrollment:enrollment(),members:[],verificationId:v.id,duplicateId:p.id,duplicateNote:'Different person; identity details checked at the desk.'}});assert.equal(distinct.status,201);
});
test('retrying registration after a lost response returns the same profile',async()=>{
  const v=(await request('/api/verification',{actor:staffA,method:'POST',body:{method:'simulated',consent:true,face:true,fingerprint:true}})).data;
  const body={profile:profile('RetryRegistration'),enrollment:enrollment(),members:[],verificationId:v.id};
  const first=await request('/api/beneficiaries',{actor:staffA,method:'POST',body});
  const retry=await request('/api/beneficiaries',{actor:staffA,method:'POST',body});
  assert.equal(first.status,201);assert.equal(retry.status,201);assert.equal(retry.data.id,first.data.id);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM beneficiaries WHERE id=$1',[first.data.id])).rows[0].count,1);
});
test('two counters cannot prepare the same individual in the same batch',async()=>{
  const person=await newPerson(),a=await assessment(person,staffA),b=await assessment(person,staffB);
  const results=await Promise.all([reserve(a,staffA),reserve(b,staffB)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  const pending=(await pool.query("SELECT * FROM claims WHERE beneficiary_id=$1 AND status='pending'",[person.id])).rows;
  assert.equal(pending.length,1);
  const blocked=await assessment(person,staffB);assert.equal(blocked.eligible,false);
  // Equal-access staff can recover a handover prepared at another counter.
  const done=await request(`/api/releases/${pending[0].id}/complete`,{actor:staffB,method:'POST',body:{acknowledged:true}});assert.equal(done.status,200);assert.equal(done.data.personnelId,'TEST-B');
});
test('request retries and simultaneous confirmations return one saved receipt',async()=>{
  const person=await newPerson(),a=await assessment(person),key=randomUUID();
  const first=await reserve(a,staffA,key),retry=await reserve(a,staffA,key);assert.equal(first.status,201);assert.equal(retry.data.id,first.data.id);
  const conflict=await reserve(a,staffA,key,{...entitlement,rice:7});assert.equal(conflict.status,409);
  await request('/api/draft',{actor:staffA,method:'PUT',body:{fields:{firstName:'Unrelated unsaved intake'},members:[]}});
  const results=await Promise.all([staffA,staffB].map(actor=>request(`/api/releases/${first.data.id}/complete`,{actor,method:'POST',body:{acknowledged:true}})));
  assert.ok(results.every(r=>r.status===200));assert.equal(results[0].data.receipt,results[1].data.receipt);
  const receipt=await request('/api/receipts/'+results[0].data.receipt,{actor:staffA});assert.equal(receipt.status,200);assert.equal(receipt.data.recordId,person.id);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM claims WHERE beneficiary_id=$1 AND status='released'",[person.id])).rows[0].count,1);
  assert.equal((await request('/api/workspace',{actor:staffA})).data.draft.fields.firstName,'Unrelated unsaved intake');
});
test('failed release transaction keeps its reservation and can be retried after recovery',async()=>{
  const p=await newPerson(),a=await assessment(p),prepared=await reserve(a),id=prepared.data.id;
  await pool.query(`CREATE FUNCTION fail_release_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='released' THEN RAISE EXCEPTION 'simulated storage failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER fail_release_test BEFORE UPDATE ON claims FOR EACH ROW EXECUTE FUNCTION fail_release_test()`);
  try{
    const fail=await request(`/api/releases/${id}/complete`,{actor:staffA,method:'POST',body:{acknowledged:true}});assert.equal(fail.status,503);
    const claim=(await pool.query('SELECT status,receipt FROM claims WHERE id=$1',[id])).rows[0];assert.equal(claim.status,'pending');assert.equal(claim.receipt,null);
    assert.equal((await assessment(p,staffB)).eligible,false);
  }finally{await pool.query('DROP TRIGGER fail_release_test ON claims; DROP FUNCTION fail_release_test()');}
  const done=await request(`/api/releases/${id}/complete`,{actor:staffA,method:'POST',body:{acknowledged:true}});assert.equal(done.status,200);assert.ok(done.data.receipt);
});
test('declined handovers preserve history but free the claim slot; released goods cannot be cancelled',async()=>{
  const p=await newPerson(),a=await assessment(p),prepared=await reserve(a);
  assert.equal((await request(`/api/releases/${prepared.data.id}/cancel`,{actor:staffA,method:'POST',body:{reason:'Declined',goodsNotHandedOver:false}})).status,422);
  assert.equal((await request(`/api/releases/${prepared.data.id}/cancel`,{actor:staffA,method:'POST',body:{reason:'Declined',goodsNotHandedOver:true}})).status,200);
  const next=await assessment(p);assert.equal(next.eligible,true);
  const second=await reserve(next);assert.equal(second.status,201);
  await request(`/api/releases/${second.data.id}/complete`,{actor:staffA,method:'POST',body:{acknowledged:true}});
  assert.equal((await request(`/api/releases/${second.data.id}/cancel`,{actor:staffA,method:'POST',body:{reason:'No',goodsNotHandedOver:true}})).status,409);
});
test('batch policy and profile changes invalidate preparation; quantities need no stock balance',async()=>{
  const p=await newPerson(),a=await assessment(p),batch=(await request('/api/workspace',{actor:staffA})).data.batch;
  const changed=await request('/api/batch',{actor:staffB,method:'PUT',body:{status:'active',incomeLimit:6000,version:batch.version}});assert.equal(changed.status,200);
  assert.equal((await reserve(a)).status,409);assert.equal((await assessment(p)).eligible,false);
  const restored=await request('/api/batch',{actor:staffA,method:'PUT',body:{status:'active',incomeLimit:null,version:changed.data.version}});assert.equal(restored.status,200);
  const fresh=await assessment(p);
  const prepared=await request('/api/releases',{actor:staffA,method:'POST',body:{assessmentId:fresh.id,idempotencyKey:randomUUID(),goods:{rice:5000,canned:4,beef:4,coffee:6,cereal:6},varianceReason:'Actual goods recorded without inventory accounting'}});assert.equal(prepared.status,201);
});
test('registration requires consent and both enrollment captures, persists attribution and preserves enrollment on edits',async()=>{
  const body={profile:profile('Enrollment'),members:[],registrationKey:randomUUID()};
  for(const input of [undefined,{...enrollment(),consent:false},{...enrollment(),fingerprintCapturedAt:null},{...enrollment(),simulated:false}]) {
    const result=await request('/api/beneficiaries',{actor:staffA,method:'POST',body:{...body,enrollment:input}});assert.equal(result.status,422);
  }
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM beneficiaries WHERE profile->>'firstName'='Enrollment'")).rows[0].count,0);
  body.enrollment=enrollment();
  const saved=await request('/api/beneficiaries',{actor:staffA,method:'POST',body});assert.equal(saved.status,201);
  const replay=await request('/api/beneficiaries',{actor:staffA,method:'POST',body});assert.equal(replay.data.id,saved.data.id);
  const viewed=await request('/api/beneficiaries/'+saved.data.id,{actor:staffB});
  const stored=viewed.data.record.biometricEnrollment;
  assert.equal(stored.simulated,true);assert.equal(stored.enrolledBy,staffA.user.id);assert.ok(stored.enrolledAt);assert.equal(stored.faceCapturedAt,body.enrollment.faceCapturedAt);assert.equal(stored.fingerprintCapturedAt,body.enrollment.fingerprintCapturedAt);
  const edited=await request('/api/beneficiaries/'+saved.data.id,{actor:staffB,method:'PUT',body:{profile:{...body.profile,contact:'changed@example.invalid'},version:saved.data.version,members:[]}});assert.equal(edited.status,200);
  const updated=await request('/api/beneficiaries/'+saved.data.id,{actor:staffB});assert.deepEqual(updated.data.record.biometricEnrollment,stored);
});
test('saved distribution names are editable with validation and version checks',async()=>{
  const batch=(await request('/api/workspace',{actor:staffA})).data.batch;
  const body={activity:'Community relief distribution',label:'October distribution',status:batch.status,incomeLimit:batch.income_limit,version:batch.version};
  const invalid=await request('/api/batch',{actor:staffA,method:'PUT',body:{...body,label:''}});assert.equal(invalid.status,422);
  const result=await request('/api/batch',{actor:staffB,method:'PUT',body});assert.equal(result.status,200);
  const saved=(await request('/api/workspace',{actor:staffA})).data.batch;assert.equal(saved.activity,body.activity);assert.equal(saved.label,body.label);assert.equal(saved.version,batch.version+1);
  assert.equal((await request('/api/batch',{actor:staffA,method:'PUT',body})).status,409);
});
test('drafts and authenticated audit records survive app restart; audit history is append-only',async()=>{
  await request('/api/draft',{actor:staffA,method:'PUT',body:{fields:{firstName:'Draft'},members:[]}});
  await new Promise(resolve=>server.close(resolve));server=createApp(pool);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  const persisted=await request('/api/workspace',{actor:staffA});assert.equal(persisted.status,200);assert.equal(persisted.data.draft.fields.firstName,'Draft');assert.ok(persisted.data.records.length>0);assert.ok(persisted.data.claims.length>0);assert.ok(persisted.data.audit.some(e=>e.actor==='Test Staff B'));
  await assert.rejects(pool.query("UPDATE audit_events SET action='changed'"),/append-only/);
  const logout=await request('/api/logout',{actor:staffA,method:'POST',body:{}});assert.equal(logout.status,200);assert.equal((await request('/api/workspace',{actor:staffA})).status,401);
});
