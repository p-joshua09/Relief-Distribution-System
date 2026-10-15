const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createPool,migrate}=require('../server/database.cjs');
const {createApp}=require('../server/index.cjs');
const schema='browser_'+randomUUID().replaceAll('-','');
const password='Browser-only-password-42';
(async()=>{
 const admin=createPool();let pool,server,browser;
 try{
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema},public`);
  pool=createPool(url.toString());await migrate(pool);
  server=createApp(pool);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('#auth-submit:not([disabled])').waitFor();
  assert.equal(await page.locator('#sidebar').isVisible(),false);
  await page.locator('#auth-name').fill('Browser Staff');await page.locator('#auth-staff-number').fill('BROWSER-01');
  await page.locator('#auth-username').fill('browser-staff');await page.locator('#auth-password').fill(password);
  await page.locator('#auth-submit').click();await page.locator('#auth-screen').waitFor({state:'hidden'});
  assert.equal(await page.locator('#staff-name').innerText(),'Browser Staff');
  assert.equal(await page.locator('[data-view-link="inventory"]').count(),0);
  assert.equal(await page.locator('[id*="supervisor"]').count(),0);
  await page.locator('[data-action="new-staff"]').click();
  await page.locator('#new-staff-name').fill('Second Browser Staff');await page.locator('#new-staff-number').fill('BROWSER-02');
  await page.locator('#new-staff-username').fill('browser-second');await page.locator('#new-staff-password').fill(password);
  await page.locator('#staff-form [type="submit"]').click();await page.locator('#staff-dialog').waitFor({state:'hidden'});
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM staff')).rows[0].count,2);
  console.log('PASS first staff setup, login, equal-access identity and removed inventory/approval controls');
  assert.equal(await page.locator('.station-location, .station-badge, .demo-note').count(),0);
  assert.equal(await page.locator('#auth-screen').innerText().then(value=>/equal access|simulated/i.test(value)),false);
  await page.locator('[data-view-link="verification"]').first().click();
  await page.locator('.demo-controls summary').click();
  await page.locator('#batch-activity').fill('Community relief distribution');await page.locator('#batch-label').fill('October distribution');
  await page.locator('#save-batch-settings').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-activity-label]')].every(element=>element.textContent==='Community relief distribution'));
  await page.reload();await page.locator('#auth-screen').waitFor({state:'hidden'});
  assert.equal(await page.locator('#batch-activity').inputValue(),'Community relief distribution');assert.equal(await page.locator('#batch-label').inputValue(),'October distribution');
  assert.ok((await page.locator('[data-batch-label]').allTextContents()).every(value=>value==='October distribution'));
  console.log('PASS saved distribution names across pages and reload, with fixed station labels removed');
  async function start(){
   await page.locator('[data-view-link="verification"]').first().click();
   if(await page.locator('.summary-card [data-action="cancel-intake"]').isVisible())await page.locator('.summary-card [data-action="cancel-intake"]').click();
   await page.locator('#registration-entry [data-action="start-distribution"]').click();
  }
  async function captures(id='new'){
   await page.locator('#capture-consent').check();await page.locator('#capture-scenario').selectOption(id);
   await page.locator('#capture-button').click();await page.locator('#capture-button').click();
  }
  async function fill(name){
   await page.locator('#registration-card').waitFor({state:'visible'});
   for(const [id,value]of Object.entries({'first-name':name,'last-name':'Browser Test','birth-date':'1990-04-17',contact:'browser@example.invalid',region:'NCR',province:'Metro Manila',city:'Manila',barangay:'Barangay 587',address:'Test address','household-size':'3',income:'7500'}))await page.locator('#'+id).fill(value);
   await page.locator('#sex').selectOption('Female');await page.locator('#civil-status').selectOption('Married');
  }
  async function save(){await page.locator('#save-registration').click();await page.locator('#registration-saved').waitFor({state:'visible'});assert.match(page.url(),/\/registration$/);}
  const links=await page.locator('.main-nav [data-view-link]').evaluateAll(nodes=>nodes.map(n=>n.dataset.viewLink));assert.ok(links.indexOf('registration')<links.indexOf('verification'));
  await page.locator('[data-view-link="registration"]').click();
  for(const id of ['region','province','city','barangay','address'])assert.equal(await page.locator('#'+id).inputValue(),'');
  assert.equal(await page.locator('#registration .biometric-demo-label').innerText(),'Demo mode');
  await fill('Registered Child');
  assert.equal(await page.locator('#capture-button').isVisible(),false);
  await page.locator('#save-registration').click();await page.locator('#enrollment-error').filter({hasText:'capture both'}).waitFor();
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM beneficiaries')).rows[0].count,0);
  await page.locator('#enroll-face').click();await page.locator('#enrollment-error').filter({hasText:'before capture'}).waitFor();
  await page.locator('#enrollment-consent').check();await page.locator('#enroll-face').click();
  assert.match(await page.locator('#enrollment-progress').innerText(),/1 of 2/);
  await page.locator('#save-registration').click();await page.locator('#enrollment-error').filter({hasText:'capture both'}).waitFor();
  await page.locator('#save-draft-button').click();await page.locator('#registration-draft-status').filter({hasText:'Draft saved'}).waitFor();
  await page.reload();await page.locator('#auth-screen').waitFor({state:'hidden'});
  await page.locator('[data-view-link="registration"]').first().click();await page.locator('#resume-draft-button').click();
  await page.locator('#registration-card').waitFor({state:'visible'});
  assert.match(page.url(),/\/registration$/);assert.equal(await page.locator('#sidebar').isVisible(),true);
  assert.equal(await page.locator('#first-name').inputValue(),'Registered Child');
  assert.equal(await page.locator('#enrollment-consent').isChecked(),true);assert.match(await page.locator('#enrollment-face-status').innerText(),/Captured/);assert.match(await page.locator('#enrollment-fingerprint-status').innerText(),/Not captured/);
  await page.locator('#enroll-fingerprint').click();await save();
  const child=(await pool.query("SELECT id FROM beneficiaries WHERE profile->>'firstName'='Registered Child'")).rows[0].id;
  await page.locator('[data-action="new-registration"]').first().click();await fill('Registered Parent');
  assert.match(await page.locator('#enrollment-progress').innerText(),/0 of 2/);
  await page.locator('#enrollment-consent').check();await page.locator('#enroll-face').click();await page.locator('#enroll-fingerprint').click();
  await page.locator('#enrollment-consent').uncheck();assert.match(await page.locator('#enrollment-progress').innerText(),/0 of 2/);
  await page.locator('#enrollment-consent').check();await page.locator('#enroll-face').click();await page.locator('#enroll-fingerprint').click();
  await page.locator('[data-action="add-member"]').click();
  await page.locator('#member-existing').selectOption(child);await page.locator('#member-confirm-link').check();await page.locator('#member-relationship').selectOption('Child');
  await page.locator('#member-form [type="submit"]').click();await save();
  assert.equal((await pool.query('SELECT related_beneficiary_id FROM family_members')).rows[0].related_beneficiary_id,child);
  const parent=(await pool.query("SELECT id FROM beneficiaries WHERE profile->>'firstName'='Registered Parent'")).rows[0].id;
  const enrollments=(await pool.query('SELECT profile->\'biometricEnrollment\' AS enrollment FROM beneficiaries')).rows;
  assert.ok(enrollments.every(row=>row.enrollment.simulated && row.enrollment.faceCapturedAt && row.enrollment.fingerprintCapturedAt && row.enrollment.enrolledBy));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM verifications')).rows[0].count,0);
  const pageShots=path.join(__dirname,'..','test-results');await fs.mkdir(pageShots,{recursive:true});
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Registration overflow at ${width}`);
    await page.screenshot({path:path.join(pageShots,`registration-${width}.png`),fullPage:true,animations:'disabled'});
  }
  await page.setViewportSize({width:1440,height:1000});
  console.log('PASS required face/fingerprint enrollment, consent, draft recovery, independent pages, navigation order and atomic family link');
  await page.locator('#verify-registration').click();assert.match(page.url(),/\/verification$/);
  await captures(parent);await page.locator('#matched-profile').waitFor({state:'visible'});
  await page.locator('[data-step-panel="verify"] [data-step="details"]').click();
  await page.locator('#registration-card').waitFor({state:'visible'});assert.match(await page.locator('#enrollment-progress').innerText(),/2 of 2/);
  await page.locator('[data-view-link="verification"]').first().click();await page.locator('#matched-profile').waitFor({state:'visible'});
  await page.locator('#profile-confirmed').check();await page.locator('#continue-details').click();
  await page.locator('[data-step-panel="eligibility"]').waitFor({state:'visible'});
  assert.equal(await page.locator('#beneficiary-form').isVisible(),false);
  await page.screenshot({path:path.join(pageShots,'verification-1440.png'),fullPage:true,animations:'disabled'});
  await page.locator('#release-button').click();await page.locator('[data-step-panel="release"]').waitFor({state:'visible'});
  assert.equal(await page.locator('#personnel-name').inputValue(),'Browser Staff');
  assert.equal(await page.locator('#receipt-ack').isDisabled(),true);
  await page.locator('#reserve-release').click();await page.locator('#handover-prepared').waitFor({state:'visible'});
  await page.reload();await page.locator('#auth-screen').waitFor({state:'hidden'});
  await page.locator('[data-view-link="pending"]').click();await page.locator('[data-resume-handover]').click();
  await page.locator('[data-step-panel="release"]').waitFor({state:'visible'});
  await page.locator('#receipt-ack').check();
  await page.route('**/api/releases/*/complete',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary test outage'})}));
  await page.locator('#confirm-release').click();await page.locator('#release-error').filter({hasText:'remains pending'}).waitFor();
  assert.equal((await pool.query("SELECT status FROM claims WHERE beneficiary_id=$1",[parent])).rows[0].status,'pending');
  await page.unroute('**/api/releases/*/complete');await page.locator('#reconnect').click();
  await page.locator('#confirm-release').click();await page.locator('#release-success').waitFor({state:'visible'});
  const receipt=await page.locator('#receipt-number').innerText();assert.match(receipt,/^RGDS-/);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM claims WHERE beneficiary_id=$1 AND status='released'",[parent])).rows[0].count,1);
  console.log('PASS reservation before handover, reload recovery, failed confirmation, safe retry and saved receipt');
  await page.locator('[data-view-link="claims"]').first().click();
  await page.locator('[data-saved-receipt]').waitFor();
  await page.evaluate(()=>{window.print=()=>{};});await page.locator('[data-saved-receipt]').click();
  await page.waitForFunction(reference=>document.getElementById('receipt-print').textContent.includes(reference),receipt);
  await start();await captures(parent);await page.locator('#matched-profile').waitFor({state:'visible'});
  await page.locator('#profile-confirmed').check();await page.locator('#continue-details').click();
  await page.locator('[data-step-panel="eligibility"]').waitFor({state:'visible'});
  assert.match(await page.locator('#eligibility-title').innerText(),/Already Claimed/);assert.equal(await page.locator('#release-button').isDisabled(),true);
  // A linked child is a different individual and may still claim in this batch.
  await start();await page.locator('#capture-consent').check();await page.locator('#capture-scenario').selectOption(child);
  await page.locator('#capture-quality').selectOption('unclear');
  for(let attempt=0;attempt<3;attempt++)await page.locator('#capture-button').click();
  await page.locator('[data-capture="manual"]').click();await page.locator('#manual-reference').fill('Test valid ID');
  await page.locator('#manual-reason').selectOption('Capture unsuccessful');await page.locator('#manual-form [type="submit"]').click();
  await page.locator('#matched-profile').waitFor({state:'visible'});
  await page.locator('#profile-confirmed').check();await page.locator('#continue-details').click();await page.locator('[data-step-panel="eligibility"]').waitFor({state:'visible'});
  assert.match(await page.locator('#eligibility-title').innerText(),/Eligible/);assert.equal(await page.locator('#release-button').isDisabled(),false);
  console.log('PASS durable receipt retrieval, current-batch duplicate blocking and independent family eligibility');
  const screenshotDir=path.join(__dirname,'..','test-results');await fs.mkdir(screenshotDir,{recursive:true});
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:1000});
   if(width>=1050)await page.locator('[data-view-link="beneficiaries"]').first().click();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`Horizontal overflow at ${width}px`);
   await page.screenshot({path:path.join(screenshotDir,`workspace-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-action="logout"]').click();await page.locator('#auth-screen').waitFor({state:'visible'});
  await page.locator('#auth-submit:not([disabled])').waitFor();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(screenshotDir,`login-${width}.png`),fullPage:true});}
  assert.deepEqual(errors,[]);console.log('PASS logout, desktop/mobile layouts, and no browser runtime errors');
 } finally {
  if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(pool)await pool.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
 }
})().catch(error=>{console.error(error);process.exit(1);});
