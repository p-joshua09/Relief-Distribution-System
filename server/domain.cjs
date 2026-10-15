const { randomUUID, randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(scryptCallback);
const { transaction } = require('./database.cjs');
const BATCH_ID = 'HABAGAT-MM04-01';
const KEYS = ['rice','canned','beef','coffee','cereal'];
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const nameOf = value => `${value.firstName} ${value.lastName}`.trim();
function fail(status, message, details = {}) { throw Object.assign(new Error(message), { status, details }); }
function text(value, max = 200, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(422,'Please complete the required fields with valid values.');
  return value.trim();
}
function uuid(value) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')) fail(422,'Invalid request reference.'); return value; }
function validProfile(input) {
  const p = {};
  for (const key of ['firstName','lastName','sex','civilStatus','region','province','address','barangay','city','contact']) p[key] = text(input[key], key === 'address' ? 500 : 200);
  p.birthDate = text(input.birthDate,10);
  const date = new Date(`${p.birthDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== p.birthDate || p.birthDate > new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'})) fail(422,'Enter a valid date of birth.');
  p.income = String(input.income);
  if (!p.income.trim() || !Number.isFinite(Number(p.income)) || Number(p.income) < 0 || Number(p.income) > 1e12) fail(422,'Enter a valid household income.');
  p.incomePeriod = text(input.incomePeriod,10);
  if (!['monthly','annual'].includes(p.incomePeriod)) fail(422,'Select monthly or annual income.');
  p.householdSize = Number(input.householdSize);
  if (!Number.isInteger(p.householdSize) || p.householdSize < 1 || p.householdSize > 20) fail(422,'Household size must be between 1 and 20.');
  p.validId = text(input.validId ?? '',100,false);
  return p;
}
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) fail(422,'Use a password with 12 to 128 characters.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password,salt,64)).toString('hex')}`;
}
async function checkPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, hash] = (stored || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const key = await scrypt(password,salt,64);
  return timingSafeEqual(Buffer.from(hash,'hex'),key);
}
const digest = value => createHash('sha256').update(value).digest('hex');
const publicStaff = row => ({ id: row.id, username: row.username, fullName: row.full_name, staffNumber: row.staff_number });
async function audit(client, user, action, recordId = null, details = {}) {
  await client.query('INSERT INTO audit_events(staff_id,action,beneficiary_id,details) VALUES($1,$2,$3,$4)',[user?.id || null,action,recordId,details]);
}
async function createStaff(client, body) {
  const username = text(body.username,60).toLowerCase();
  if (!/^[a-z0-9._-]{3,60}$/.test(username)) fail(422,'Username must contain 3–60 letters, numbers, dots, underscores, or hyphens.');
  const hash = await hashPassword(body.password);
  return publicStaff((await client.query('INSERT INTO staff(id,username,full_name,staff_number,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING *',[randomUUID(),username,text(body.fullName,100),text(body.staffNumber,60),hash])).rows[0]);
}
async function beneficiaries(client) {
  const people = (await client.query('SELECT id,profile,version,updated_at FROM beneficiaries ORDER BY updated_at DESC')).rows;
  const members = (await client.query(`SELECT f.*,p.profile AS linked_profile FROM family_members f LEFT JOIN beneficiaries p ON p.id=f.related_beneficiary_id ORDER BY f.id`)).rows;
  return people.map(row => ({ ...row.profile, id:row.id, version:row.version, registered:true, verified:false, template:null, status:'registered', lastActivity:row.updated_at.toISOString(), members:members.filter(f=>f.beneficiary_id===row.id).map(f=>({ id:f.id, relatedBeneficiaryId:f.related_beneficiary_id, name:f.linked_profile ? nameOf(f.linked_profile) : f.declared_name, relationship:f.relationship, age:f.linked_profile ? ageAt(f.linked_profile.birthDate) : f.declared_age })) }));
}
function ageAt(birthDate) {
  const today = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
  const [y,m,d]=today.split('-').map(Number),[by,bm,bd]=birthDate.split('-').map(Number);
  return y-by-(m<bm || m===bm && d<bd ? 1 : 0);
}
async function claims(client, statuses = ['released']) {
  const rows = (await client.query(`SELECT c.*,s.full_name,s.staff_number,b.label,b.activity FROM claims c JOIN staff s ON s.id=COALESCE(c.released_by,c.prepared_by) JOIN batches b ON b.id=c.batch_id WHERE c.status=ANY($1::text[]) ORDER BY c.prepared_at DESC`,[statuses])).rows;
  if (!rows.length) return [];
  const items = (await client.query('SELECT claim_id,item_key,quantity FROM claim_items WHERE claim_id=ANY($1::uuid[])',[rows.map(r=>r.id)])).rows;
  return rows.map(r=>({ ...r.snapshot,id:r.id,recordId:r.beneficiary_id,batchId:r.batch_id,batchLabel:r.label,activity:r.activity,receipt:r.receipt,goods:Object.fromEntries(items.filter(i=>i.claim_id===r.id).map(i=>[i.item_key,i.quantity])),varianceReason:r.variance_reason,personnelName:r.full_name,personnelId:r.staff_number,status:r.status==='released'?'Released':'Pending',preparedAt:r.prepared_at.toISOString(),releasedAt:r.released_at?.toISOString() || null }));
}
async function workspace(pool,user) {
  return transaction(pool,async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    const batch = (await client.query('SELECT * FROM batches WHERE id=$1',[BATCH_ID])).rows[0];
    const events=(await client.query('SELECT a.*,s.full_name FROM audit_events a LEFT JOIN staff s ON s.id=a.staff_id ORDER BY a.id DESC LIMIT 500')).rows;
    return { batch, records:await beneficiaries(client),claims:await claims(client),pending:await claims(client,['pending']),audit:events.reverse().map(e=>({id:`AUD-${e.id}`,at:e.occurred_at.toISOString(),action:e.action,recordId:e.beneficiary_id,actor:e.full_name || 'System',details:e.details})),draft:(await client.query('SELECT data FROM staff_drafts WHERE staff_id=$1',[user.id])).rows[0]?.data || null };
  });
}
async function saveProfile(pool,user,body,id=null) {
  const profile=validProfile(body.profile || {});
  let enrollment=null;
  if(body.enrollment !== undefined && body.enrollment !== null) {
    const input=body.enrollment;
    if(input.simulated!==true || input.consent!==true) fail(422,'Acknowledge the privacy notice and complete both simulated enrollment captures.');
    enrollment={simulated:true,consent:true};
    for(const key of ['faceCapturedAt','fingerprintCapturedAt']) {
      const value=input[key], date=new Date(value);
      if(typeof value!=='string' || !Number.isFinite(date.getTime()) || date.getTime()>Date.now()+60000) fail(422,'Complete both face and fingerprint enrollment before saving registration.');
      enrollment[key]=date.toISOString();
    }
  }
  if(!id && !enrollment) fail(422,'Complete face and fingerprint enrollment before saving registration.');
  const members=body.members || [];
  const registrationHash=digest(JSON.stringify({profile,members,enrollment,duplicateId:body.duplicateId||null,duplicateNote:body.duplicateNote||''}));
  if (!Array.isArray(members) || members.length > 19 || members.length+1 > profile.householdSize) fail(422,'Review household members and the declared household size.');
  return transaction(pool,async client=>{
    const registrationKey=!id && !body.verificationId ? uuid(body.registrationKey) : null;
    if(registrationKey) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`registration:${registrationKey}`]);
      const request=(await client.query('SELECT * FROM registration_requests WHERE request_key=$1',[registrationKey])).rows[0];
      if(request) {
        if(request.staff_id!==user.id || request.request_hash!==registrationHash)fail(409,'This registration reference was used for different information. Start a new registration or reopen the saved profile.');
        const person=(await client.query('SELECT id,version FROM beneficiaries WHERE id=$1',[request.beneficiary_id])).rows[0];
        if(person?.version===1)return person;
        fail(409,`Registration is already saved as ${request.beneficiary_id}. Open that profile before making changes.`,{duplicateId:request.beneficiary_id});
      }
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${normalize(nameOf(profile))}|${profile.birthDate}`]);
    let previous=null;
    if(id) {
      previous=(await client.query('SELECT * FROM beneficiaries WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!previous) fail(404,'Beneficiary not found.');
      if(previous.version!==body.version) fail(409,'This profile was changed at another counter. Reload it before editing.');
    }
    const verification=body.verificationId?(await client.query('SELECT * FROM verifications WHERE id=$1 AND staff_id=$2 AND expires_at>now() FOR UPDATE',[uuid(body.verificationId),user.id])).rows[0]:null;
    if(body.verificationId && !verification) fail(422,'The supplied verification is expired or unavailable.');
    if(!id && verification?.beneficiary_id) {
      if(verification.registration_hash===registrationHash) {
        const existing=(await client.query('SELECT id,version FROM beneficiaries WHERE id=$1',[verification.beneficiary_id])).rows[0];
        if(existing?.version===1)return existing;
      }
      fail(409,`Registration is already saved as ${verification.beneficiary_id}. Open that profile before making changes.`,{duplicateId:verification.beneficiary_id});
    }
    if(verification?.beneficiary_id && verification.beneficiary_id!==id)fail(422,'The verification belongs to another beneficiary.');
    const candidates=(await client.query('SELECT id,profile FROM beneficiaries WHERE id<>$1 AND normalized_name=$2 AND birth_date=$3',[id || '',normalize(nameOf(profile)),profile.birthDate])).rows;
    if(candidates.length && (!candidates.some(r=>r.id===body.duplicateId) || !body.duplicateNote?.trim())) fail(409,'A similar profile already exists. Link to it or document why this is a different person.',{duplicateId:candidates[0].id});
    const previousEnrollment=previous?.profile.biometricEnrollment;
    const unchanged=enrollment && previousEnrollment && ['faceCapturedAt','fingerprintCapturedAt'].every(key=>enrollment[key]===previousEnrollment[key]);
    const savedEnrollment=enrollment ? unchanged ? previousEnrollment : {...enrollment,enrolledAt:new Date().toISOString(),enrolledBy:user.id} : previousEnrollment;
    const savedProfile={...profile,...(savedEnrollment?{biometricEnrollment:savedEnrollment}:{})};
    id ||= `RL-${randomUUID()}`;
    const saved=(await client.query(`INSERT INTO beneficiaries(id,profile,normalized_name,birth_date,normalized_valid_id,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET profile=EXCLUDED.profile,normalized_name=EXCLUDED.normalized_name,birth_date=EXCLUDED.birth_date,normalized_valid_id=EXCLUDED.normalized_valid_id,version=beneficiaries.version+1,updated_at=now() RETURNING *`,[id,savedProfile,normalize(nameOf(profile)),profile.birthDate,normalize(profile.validId)||null,user.id])).rows[0];
    await client.query('DELETE FROM family_members WHERE beneficiary_id=$1',[id]);
    const seen=new Set();
    for(const member of members) {
      const relationship=text(member.relationship,20);
      if(!['Spouse','Child','Parent','Sibling','Other'].includes(relationship)) fail(422,'Choose a valid family relationship.');
      let related=null, memberName=text(member.name,200), age=member.age===null || member.age==='' || member.age===undefined ? null : Number(member.age);
      if(age!==null && (!Number.isInteger(age) || age<0 || age>120)) fail(422,'Enter a valid member age.');
      if(member.relatedBeneficiaryId) {
        related=text(member.relatedBeneficiaryId,80);
        if(related===id) fail(422,'A beneficiary cannot be their own family member.');
        const person=(await client.query('SELECT profile FROM beneficiaries WHERE id=$1',[related])).rows[0];
        if(!person) fail(422,'The linked family record is unavailable.');
        memberName=nameOf(person.profile); age=null;
      }
      const key=related || `declared:${normalize(memberName)}`;
      if(seen.has(key)) fail(422,'This family member is already linked.');
      seen.add(key);
      await client.query('INSERT INTO family_members(id,beneficiary_id,related_beneficiary_id,declared_name,relationship,declared_age) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,related,memberName,relationship,age]);
    }
    if(verification)await client.query('UPDATE verifications SET beneficiary_id=$1,registration_hash=COALESCE(registration_hash,$3) WHERE id=$2',[id,verification.id,previous?null:registrationHash]);
    if(registrationKey)await client.query('INSERT INTO registration_requests(request_key,staff_id,request_hash,beneficiary_id) VALUES($1,$2,$3,$4)',[registrationKey,user.id,registrationHash,id]);
    await audit(client,user,previous?'Beneficiary profile updated':'Beneficiary registered',id,{oldValues:previous?.profile||null,newValues:savedProfile,members,duplicateReview:body.duplicateNote || null});
    await client.query("DELETE FROM staff_drafts WHERE staff_id=$1 AND data->'fields'=$2::jsonb AND data->'members'=$3::jsonb",[user.id,JSON.stringify(profile),JSON.stringify(members)]);
    return { id,version:saved.version };
  });
}
async function verify(pool,user,body) {
  const method=body.method;
  if(!body.consent || !['simulated','manual'].includes(method)) fail(422,'Record the privacy acknowledgment and verification method.');
  const details = method==='simulated' ? {simulated:true,noBiometricData:true,face:body.face===true,fingerprint:body.fingerprint===true} : {reference:text(body.reference,100),reason:text(body.reason,200)};
  if(method==='simulated' && (!details.face || !details.fingerprint)) fail(422,'Complete both simulated capture checks.');
  return transaction(pool,async client=>{
    if(body.recordId && !(await client.query('SELECT id FROM beneficiaries WHERE id=$1',[body.recordId])).rowCount) fail(404,'Beneficiary not found.');
    if(method==='manual' && !body.recordId) fail(422,'Select a registered beneficiary for valid-ID verification.');
    const id=randomUUID();
    await client.query('INSERT INTO verifications(id,staff_id,beneficiary_id,method,details) VALUES($1,$2,$3,$4,$5)',[id,user.id,body.recordId||null,method,details]);
    await audit(client,user,method==='manual'?'Valid-ID verification recorded':'Simulated verification recorded',body.recordId||null,details);
    return {id};
  });
}
async function assess(pool,user,body) {
  return transaction(pool,async client=>{
    const person=(await client.query('SELECT * FROM beneficiaries WHERE id=$1 FOR SHARE',[body.recordId])).rows[0];
    if(!person) fail(404,'Beneficiary not found.');
    const batch=(await client.query('SELECT * FROM batches WHERE id=$1 FOR SHARE',[BATCH_ID])).rows[0];
    const verification=(await client.query('SELECT * FROM verifications WHERE id=$1 AND staff_id=$2 AND beneficiary_id=$3 AND expires_at>now()',[uuid(body.verificationId),user.id,person.id])).rows[0];
    const claim=(await client.query("SELECT status,receipt,prepared_at FROM claims WHERE beneficiary_id=$1 AND batch_id=$2 AND status IN ('pending','released')",[person.id,BATCH_ID])).rows[0];
    const monthly=Number(person.profile.income)/(person.profile.incomePeriod==='annual'?12:1);
    const rules=[
      {title:'Active batch',passed:batch.status==='active',description:`${batch.label} is ${batch.status}.`},
      {title:'Identity verification',passed:Boolean(verification),description:verification?verification.method==='manual'?'Valid-ID verification recorded by signed-in staff.':'Face and fingerprint checks completed.':'Complete verification before assessment.'},
      {title:'Personnel profile confirmation',passed:body.profileConfirmed===true,description:'Staff must confirm the profile belongs to the person at the desk.'},
      {title:'Current batch individual claim history',passed:!claim,description:claim?claim.status==='pending'?'A handover is already pending for this beneficiary.':`Already claimed: ${claim.receipt}. Another release is blocked.`:'No claim in this batch. Earlier batches and family claims do not block this person.'},
      {title:'Batch income rule',passed:batch.income_limit===null || monthly<=Number(batch.income_limit),description:batch.income_limit===null?'No income limit configured.':`Monthly equivalent must not exceed ₱${Number(batch.income_limit).toLocaleString('en-PH')}.`}
    ];
    const result={id:randomUUID(),eligible:rules.every(r=>r.passed),status:claim?'released':'review',rules};
    if(result.eligible) result.status='ready';
    if(!verification) fail(422,'Verification is missing or expired. Verify the beneficiary again.');
    await client.query('INSERT INTO assessments(id,staff_id,beneficiary_id,batch_id,verification_id,profile_version,batch_version,eligible,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[result.id,user.id,person.id,BATCH_ID,verification.id,person.version,batch.version,result.eligible,result]);
    await audit(client,user,'Eligibility assessed',person.id,result);
    return result;
  });
}
async function confirmAssessment(pool,user,id) {
  const result=await pool.query('UPDATE assessments SET confirmed_at=now() WHERE id=$1 AND staff_id=$2 AND eligible=true AND created_at>now()-interval \'15 minutes\' RETURNING confirmed_at',[uuid(id),user.id]);
  if(!result.rowCount) fail(409,'Eligibility is missing or expired. Run the assessment again.');
  return {readyAt:result.rows[0].confirmed_at.toISOString()};
}
function goodsValues(goods) {
  if(!goods || Object.keys(goods).length!==KEYS.length || KEYS.some(k=>!Number.isSafeInteger(goods[k]) || goods[k]<0 || goods[k]>1000000) || !KEYS.some(k=>goods[k]>0)) fail(422,'Enter valid nonnegative whole quantities and at least one item.');
  return Object.fromEntries(KEYS.map(k=>[k,goods[k]]));
}
async function reserve(pool,user,body) {
  const key=uuid(body.idempotencyKey),goods=goodsValues(body.goods),reason=text(body.varianceReason||'',500,false);
  const requestHash=digest(JSON.stringify({assessmentId:body.assessmentId,goods,reason}));
  return transaction(pool,async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[key]);
    const existing=(await client.query('SELECT id,request_hash,status FROM claims WHERE idempotency_key=$1',[key])).rows[0];
    if(existing) { if(existing.request_hash!==requestHash || existing.status==='cancelled') fail(409,'This request reference was already used for a different or cancelled handover.'); return {id:existing.id}; }
    const a=(await client.query('SELECT * FROM assessments WHERE id=$1 AND staff_id=$2',[uuid(body.assessmentId),user.id])).rows[0];
    if(!a || !a.eligible || !a.confirmed_at || Date.now()-a.created_at.getTime()>15*60*1000) fail(409,'Confirm a current eligible assessment before preparing the handover.');
    const batch=(await client.query('SELECT * FROM batches WHERE id=$1 FOR SHARE',[a.batch_id])).rows[0];
    const p=(await client.query('SELECT * FROM beneficiaries WHERE id=$1 FOR UPDATE',[a.beneficiary_id])).rows[0];
    const v=(await client.query('SELECT * FROM verifications WHERE id=$1 AND expires_at>now()',[a.verification_id])).rows[0];
    if(!v || batch.status!=='active' || batch.version!==a.batch_version || p.version!==a.profile_version) fail(409,'The batch, profile, or verification changed. Review eligibility again.');
    const competing=(await client.query("SELECT id,receipt,status FROM claims WHERE beneficiary_id=$1 AND batch_id=$2 AND status IN ('pending','released')",[p.id,batch.id])).rows[0];
    if(competing) fail(409,competing.status==='pending'?'A handover is already pending for this beneficiary.':'This beneficiary already claimed in this batch.',{claimId:competing.id});
    if(KEYS.some(k=>goods[k]!==batch.entitlement[k]) && !reason) fail(422,'Record a reason when actual goods differ from the entitlement.');
    const id=randomUUID();
    const snapshot={beneficiary:nameOf(p.profile),householdSize:p.profile.householdSize,package:'Family food package',quantity:1,entitlement:batch.entitlement,method:v.method==='manual'?'Valid-ID verification':'Simulated face + fingerprint',eligibilityConfirmedAt:a.confirmed_at.toISOString()};
    await client.query("INSERT INTO claims(id,beneficiary_id,batch_id,assessment_id,prepared_by,status,idempotency_key,request_hash,snapshot,variance_reason) VALUES($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9)",[id,p.id,batch.id,a.id,user.id,key,requestHash,snapshot,reason]);
    for(const [item,amount] of Object.entries(goods)) await client.query('INSERT INTO claim_items(claim_id,item_key,quantity) VALUES($1,$2,$3)',[id,item,amount]);
    await audit(client,user,'Handover prepared',p.id,{claimId:id,goods,varianceReason:reason});
    return {id};
  });
}
async function complete(pool,user,id,body) {
  if(body.acknowledged!==true) fail(422,'Confirm that the beneficiary received the goods.');
  await transaction(pool,async client=>{
    const claim=(await client.query('SELECT * FROM claims WHERE id=$1 FOR UPDATE',[uuid(id)])).rows[0];
    if(!claim) fail(404,'Handover not found.');
    if(claim.status==='released') return;
    if(claim.status!=='pending') fail(409,'This handover was cancelled.');
    const receipt=`RGDS-${new Date().getUTCFullYear()}-${claim.id.toUpperCase()}`;
    await client.query("UPDATE claims SET status='released',released_by=$1,released_at=now(),receipt=$2 WHERE id=$3",[user.id,receipt,id]);
    await audit(client,user,'Relief release recorded',claim.beneficiary_id,{claimId:id,receipt,varianceReason:claim.variance_reason});
  });
  return (await claims(pool)).find(c=>c.id===id);
}
async function cancel(pool,user,id,body) {
  const reason=text(body.reason,500);
  return transaction(pool,async client=>{
    const claim=(await client.query('SELECT * FROM claims WHERE id=$1 FOR UPDATE',[uuid(id)])).rows[0];
    if(!claim) fail(404,'Handover not found.');
    if(claim.status==='released') fail(409,'A completed handover cannot be cancelled.');
    if(claim.status==='pending') {
      if(body.goodsNotHandedOver!==true) fail(422,'Cancellation is allowed only when goods have not been handed over.');
      await client.query("UPDATE claims SET status='cancelled',cancelled_at=now(),cancellation_reason=$1 WHERE id=$2",[reason,id]);
      await audit(client,user,'Handover cancelled before release',claim.beneficiary_id,{claimId:id,reason});
    }
    return {cancelled:true};
  });
}
module.exports={BATCH_ID,KEYS,normalize,nameOf,fail,text,uuid,hashPassword,checkPassword,digest,publicStaff,audit,createStaff,beneficiaries,claims,workspace,saveProfile,verify,assess,confirmAssessment,reserve,complete,cancel};
