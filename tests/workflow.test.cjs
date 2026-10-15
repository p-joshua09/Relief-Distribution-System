'use strict';

// End-to-end checks for the fictional, in-memory use-case demonstration.
// Run: node tests/workflow.test.cjs
// PLAYWRIGHT_MODULE may point at an existing Playwright package.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    'playwright',
    path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  throw new Error('Playwright is required. Set PLAYWRIGHT_MODULE to its package path.');
}

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (target !== root && !target.startsWith(root + path.sep)) {
    response.writeHead(403).end(); return;
  }
  fs.readFile(target, (error, data) => {
    if (error) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    response.end(data);
  });
});

let browser;
let origin;
let passed = 0;
let failed = 0;
const artifactDir = process.env.TEST_ARTIFACT_DIR || path.join(os.tmpdir(), 'relief-distribution-browser-checks');
const byId = (page, id) => page.locator('#' + id);
const panel = (page, step) => page.locator(`[data-step-panel="${step}"]`);
async function visible(locator, message) { await locator.waitFor({ state: 'visible' }); assert.equal(await locator.isVisible(), true, message); }
async function disabled(locator, message) { assert.equal(await locator.isDisabled(), true, message); }
async function enabled(locator, message) { assert.equal(await locator.isEnabled(), true, message); }
async function contains(locator, pattern, message) { assert.match(await locator.textContent(), pattern, message); }
async function textOf(page, id) { return (await byId(page, id).textContent()).trim(); }
async function clickAction(page, action) { await page.locator(`[data-action="${action}"]:visible`).first().click(); }
async function demoControls(page) {
  if (!await byId(page, 'batch-status').isVisible()) await page.locator('.demo-controls > summary').click();
}
async function start(page, scenario = 'RL-0005') {
  await clickAction(page, 'start-distribution');
  await visible(panel(page, 'verify'), 'A new distribution starts with biometric capture.');
  await byId(page, 'capture-scenario').selectOption(scenario);
}
async function capture(page, mode, quality = 'clear') {
  await page.locator(`[data-capture="${mode}"]`).click();
  await byId(page, 'capture-quality').selectOption(quality);
  await byId(page, 'capture-button').click();
}
async function bothCaptures(page) {
  await byId(page, 'capture-consent').check();
  await capture(page, 'face');
  await capture(page, 'fingerprint');
  await page.locator('#matched-profile:visible, [data-step-panel="details"]:visible').first().waitFor({ state: 'visible' });
}
async function confirmProfile(page) {
  await byId(page, 'profile-confirmed').check();
  await byId(page, 'continue-details').click();
  await visible(panel(page, 'eligibility'), 'Profile confirmation leads to eligibility.');
}
async function prepare(page, scenario = 'RL-0005') {
  await start(page, scenario);
  await bothCaptures(page);
  await confirmProfile(page);
  await enabled(byId(page, 'release-button'), 'An eligible beneficiary can be approved by personnel.');
  await byId(page, 'release-button').click();
  await visible(panel(page, 'release'), 'Personnel approval opens package preparation.');
}
async function acknowledge(page) {
  await byId(page, 'personnel-name').fill('Test Distribution Officer');
  await byId(page, 'personnel-id').fill('DSWD-DEMO-TEST');
  await byId(page, 'receipt-ack').check();
}
async function confirmRelease(page) {
  await acknowledge(page);
  await enabled(byId(page, 'confirm-release'), 'Acknowledgment and personnel details enable release.');
  await byId(page, 'confirm-release').click();
  await visible(byId(page, 'release-success'), 'Successful handover generates a confirmation.');
  assert.match(await textOf(page, 'receipt-number'), /^DEMO-R-\d+$/);
}
async function checkNoRelease(page, before) {
  assert.equal(await textOf(page, 'inventory-released'), before, 'No claim or stock movement occurs.');
  assert.equal(await byId(page, 'release-success').isVisible(), false);
}

async function test(name, run) {
  if (process.env.TEST_FILTER && !new RegExp(process.env.TEST_FILTER, 'i').test(name)) return;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.setDefaultTimeout(6000);
  try {
    await page.goto(origin);
    await run(page);
    assert.deepEqual(errors, [], 'No browser runtime or console errors.');
    passed++;
    console.log('PASS ' + name);
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n  ' + error.message);
    if (errors.length) console.error('  Browser errors: ' + errors.join('; '));
  } finally { await context.close(); }
}

async function runTests() {
  await test('Privacy acknowledgment, both biometrics, and profile confirmation gate assessment', async page => {
    await start(page);
    await disabled(byId(page, 'continue-details'));
    if (await byId(page, 'capture-button').isEnabled()) {
      await capture(page, 'face');
      await contains(byId(page, 'verification-error'), /privacy|acknowledg/i);
    }
    await byId(page, 'capture-consent').check();
    await capture(page, 'face');
    await disabled(byId(page, 'continue-details'), 'Face alone is insufficient.');
    assert.equal(await byId(page, 'matched-profile').isVisible(), false, 'Matching waits for both captures.');
    await capture(page, 'fingerprint');
    await visible(byId(page, 'matched-profile'));
    await contains(byId(page, 'matched-profile'), /Ana Reyes/);
    await disabled(byId(page, 'continue-details'), 'Personnel must confirm the matched profile.');
    await confirmProfile(page);
    await contains(byId(page, 'eligibility-title'), /eligible/i);
  });

  await test('Previous-batch claim permits one release and updates history and stock once', async page => {
    await start(page);
    await bothCaptures(page);
    await contains(byId(page, 'claim-history-preview'), /DEMO-R-PREV01/);
    await contains(byId(page, 'claim-history-preview'), /previous batch/i);
    const initialReleased = Number(await textOf(page, 'inventory-released'));
    const initialAvailable = Number(await textOf(page, 'inventory-available'));
    await confirmProfile(page);
    await byId(page, 'release-button').click();
    await disabled(byId(page, 'confirm-release'), 'Handover acknowledgment is required.');
    for (const [id, value] of Object.entries({ rice: 6, canned: 4, beef: 4, coffee: 6, cereal: 6 })) {
      assert.equal(await byId(page, 'actual-' + id).inputValue(), String(value));
    }
    await confirmRelease(page);
    assert.equal(Number(await textOf(page, 'inventory-released')), initialReleased + 1);
    assert.equal(Number(await textOf(page, 'inventory-available')), initialAvailable - 1);
    const receipt = await textOf(page, 'receipt-number');
    await contains(byId(page, 'receipt-personnel'), /Test Distribution Officer.*DSWD-DEMO-TEST/);
    await page.locator('[data-view-link="claims"]').first().click();
    await byId(page, 'claims-search').fill('Ana Reyes');
    const rows = page.locator('#claims-table tr');
    assert.equal(await rows.count(), 2, 'The old and new claims are displayed.');
    await contains(byId(page, 'claims-table'), new RegExp(receipt));
    await page.locator('[data-view-link="registration"]').first().click();
    await byId(page, 'confirm-release').dispatchEvent('click');
    assert.equal(Number(await textOf(page, 'inventory-released')), initialReleased + 1, 'Repeated release attempts do not add transactions.');
  });

  await test('Current-batch duplicate is blocked with the original reference', async page => {
    await start(page, 'RL-0001');
    await bothCaptures(page);
    await contains(byId(page, 'claim-history-preview'), /DEMO-R-0001/);
    const initialReleased = await textOf(page, 'inventory-released');
    await confirmProfile(page);
    await contains(byId(page, 'eligibility-title'), /already claimed|not eligible/i);
    await contains(byId(page, 'rule-list'), /DEMO-R-0001/);
    await disabled(byId(page, 'release-button'));
    await checkNoRelease(page, initialReleased);
  });

  await test('Unmatched biometric capture leads to personnel registration with optional ID', async page => {
    await start(page, 'new');
    await bothCaptures(page);
    if (await panel(page, 'verify').isVisible()) await byId(page, 'continue-details').click();
    await visible(panel(page, 'details'));
    await clickAction(page, 'use-demo');
    await byId(page, 'valid-id').fill('');
    await byId(page, 'beneficiary-form').locator('[type="submit"]').click();
    await visible(panel(page, 'eligibility'));
    await contains(byId(page, 'eligibility-title'), /eligible/i);
    const recordId = await textOf(page, 'summary-id');
    assert.match(recordId, /^RL-\d{4}$/);
    await byId(page, 'release-button').click();
    await confirmRelease(page);
    await contains(byId(page, 'receipt-print'), new RegExp(recordId));
    await contains(byId(page, 'summary-method'), /face.*fingerprint/i);
    const receipt = await textOf(page, 'receipt-number');
    await clickAction(page, 'start-registration');
    await byId(page, 'capture-scenario').selectOption(recordId);
    await contains(byId(page, 'capture-scenario').locator(`option[value="${recordId}"]`), /already claimed/i);
    await bothCaptures(page);
    await confirmProfile(page);
    await disabled(byId(page, 'release-button'), 'A newly registered beneficiary cannot claim again in a later intake.');
    await contains(byId(page, 'rule-list'), new RegExp(receipt));
  });

  await test('Three poor captures unlock manual verification with ID and supervisor approval', async page => {
    await start(page);
    await disabled(page.locator('[data-capture="manual"]'), 'Manual fallback is unavailable before a capture failure.');
    await byId(page, 'capture-consent').check();
    await capture(page, 'face', 'unclear');
    await disabled(page.locator('[data-capture="manual"]'));
    await capture(page, 'face', 'unclear');
    await disabled(page.locator('[data-capture="manual"]'));
    await capture(page, 'face', 'unclear');
    await contains(byId(page, 'capture-face-status'), /failed|3/i);
    await enabled(page.locator('[data-capture="manual"]'));
    await page.locator('[data-capture="manual"]').click();
    await byId(page, 'manual-reference').fill('DEMO-VALID-ID-TEST-123');
    await byId(page, 'manual-reason').selectOption({ label: 'Capture unsuccessful' });
    await byId(page, 'manual-form').locator('[type="submit"]').click();
    assert.equal(await byId(page, 'matched-profile').isVisible(), false, 'Missing supervisor details cannot verify identity.');
    await byId(page, 'manual-supervisor-name').fill('Test Supervisor');
    await byId(page, 'manual-supervisor-id').fill('SUP-DEMO-TEST');
    await byId(page, 'manual-form').locator('[type="submit"]').click();
    await visible(byId(page, 'matched-profile'));
    await confirmProfile(page);
    await contains(byId(page, 'eligibility-title'), /eligible/i);
    await byId(page, 'release-button').click();
    await contains(byId(page, 'release-method'), /manual/i);
  });

  await test('Device failure cannot produce a biometric match', async page => {
    await start(page);
    await byId(page, 'capture-consent').check();
    await capture(page, 'fingerprint', 'device-error');
    await contains(byId(page, 'verification-error'), /device|respond|unavailable/i);
    await disabled(byId(page, 'continue-details'));
    assert.equal(await byId(page, 'matched-profile').isVisible(), false);
    await enabled(page.locator('[data-capture="manual"]'));
  });

  await test('Registry failure pauses assessment and retry completes it', async page => {
    await start(page);
    await demoControls(page);
    await byId(page, 'registry-unavailable').check();
    await byId(page, 'capture-consent').check();
    await capture(page, 'face');
    await capture(page, 'fingerprint');
    await disabled(byId(page, 'continue-details'));
    assert.equal(await byId(page, 'matched-profile').isVisible(), false);
    await contains(byId(page, 'verification-error'), /registry|database|unavailable/i);
    await byId(page, 'registry-unavailable').uncheck();
    if (!await byId(page, 'matched-profile').isVisible()) await byId(page, 'capture-button').click();
    await visible(byId(page, 'matched-profile'));
    await confirmProfile(page);
    await contains(byId(page, 'eligibility-title'), /eligible/i);
  });

  for (const state of ['paused', 'closed']) {
    await test(`${state} batch cannot release goods after preparation`, async page => {
      await prepare(page);
      const released = await textOf(page, 'inventory-released');
      await acknowledge(page);
      await demoControls(page);
      await byId(page, 'batch-status').selectOption(state);
      await disabled(byId(page, 'confirm-release'));
      await checkNoRelease(page, released);
      await byId(page, 'batch-status').selectOption('active');
      if (await panel(page, 'release').isVisible()) await byId(page, 'confirm-release').click();
      else {
        if (await panel(page, 'verify').isVisible()) await confirmProfile(page);
        await visible(panel(page, 'eligibility'));
        await byId(page, 'release-button').click();
        await confirmRelease(page);
      }
      await visible(byId(page, 'release-success'));
    });
  }

  await test('Configured monthly income rule blocks an otherwise verified beneficiary', async page => {
    await start(page);
    await demoControls(page);
    await byId(page, 'batch-income-limit').fill('1000');
    await bothCaptures(page);
    await confirmProfile(page);
    await contains(byId(page, 'eligibility-title'), /not eligible/i);
    await contains(byId(page, 'rule-list'), /income/i);
    await disabled(byId(page, 'release-button'));
  });

  await test('Beneficiary decline records a reason without a claim or stock deduction', async page => {
    await prepare(page);
    const released = await textOf(page, 'inventory-released');
    await byId(page, 'cancel-release').click();
    await visible(byId(page, 'cancel-release-dialog'));
    await byId(page, 'cancel-release-form').locator('[type="submit"]').click();
    await visible(byId(page, 'cancel-release-dialog'), 'Cancellation requires a reason.');
    await byId(page, 'cancel-release-reason').fill('Beneficiary declined the prepared package.');
    await byId(page, 'cancel-release-form').locator('[type="submit"]').click();
    await checkNoRelease(page, released);
    await visible(panel(page, 'eligibility'));
    await contains(byId(page, 'eligibility-title'), /eligible|ready for distribution/i);
    await byId(page, 'release-button').click();
    await visible(panel(page, 'release'), 'Beneficiary stays eligible after declining.');
  });

  await test('Actual goods variance requires a reason and records actual item stock and receipt', async page => {
    await prepare(page);
    const beforeRice = Number(await textOf(page, 'inventory-rice-available'));
    const beforeCereal = Number(await textOf(page, 'inventory-cereal-available'));
    const initialReleased = await textOf(page, 'inventory-released');
    await byId(page, 'actual-rice').fill('5');
    await byId(page, 'actual-cereal').fill('4');
    await acknowledge(page);
    await visible(byId(page, 'release-variance-notice'));
    await disabled(byId(page, 'confirm-release'), 'A variance cannot be saved without its reason.');
    await checkNoRelease(page, initialReleased);
    await byId(page, 'release-variance-reason').fill('Two cereal sachets and one kilogram of rice replaced at the next station.');
    await byId(page, 'confirm-release').click();
    await visible(byId(page, 'release-success'));
    await contains(byId(page, 'receipt-goods'), /5 kg rice/i);
    await contains(byId(page, 'receipt-goods'), /4 cereal/i);
    assert.equal(Number(await textOf(page, 'inventory-rice-available')), beforeRice - 5);
    assert.equal(Number(await textOf(page, 'inventory-cereal-available')), beforeCereal - 4);
  });

  await test('Release cannot exceed item stock', async page => {
    await prepare(page);
    const initialReleased = await textOf(page, 'inventory-released');
    const availableRice = Number(await textOf(page, 'inventory-rice-available'));
    await byId(page, 'actual-rice').fill(String(availableRice + 1));
    await byId(page, 'release-variance-reason').fill('Stock guard test.');
    await acknowledge(page);
    await disabled(byId(page, 'confirm-release'));
    await checkNoRelease(page, initialReleased);
  });

  await test('Rejecting a matched profile requires both captures again', async page => {
    await start(page);
    await bothCaptures(page);
    await byId(page, 'reject-match').click();
    assert.equal(await byId(page, 'matched-profile').isVisible(), false);
    await disabled(byId(page, 'continue-details'));
    await capture(page, 'face');
    await disabled(byId(page, 'continue-details'));
    await capture(page, 'fingerprint');
    await visible(byId(page, 'matched-profile'));
    await confirmProfile(page);
    await contains(byId(page, 'eligibility-title'), /eligible/i);
    await contains(byId(page, 'audit-list'), /reject|recapture/i);
  });

  await test('Registry save failure preserves encoded fields without creating a partial profile', async page => {
    await start(page, 'new');
    await bothCaptures(page);
    if (await panel(page, 'verify').isVisible()) await byId(page, 'continue-details').click();
    await clickAction(page, 'use-demo');
    const firstName = await byId(page, 'first-name').inputValue();
    const beforeCount = await textOf(page, 'stat-households');
    await demoControls(page);
    await byId(page, 'registry-unavailable').check();
    await byId(page, 'beneficiary-form').locator('[type="submit"]').click();
    await visible(panel(page, 'details'));
    assert.equal(await byId(page, 'first-name').inputValue(), firstName);
    assert.equal(await textOf(page, 'stat-households'), beforeCount);
    await contains(byId(page, 'form-error'), /registry|database|unavailable/i);
    await byId(page, 'registry-unavailable').uncheck();
    await byId(page, 'beneficiary-form').locator('[type="submit"]').click();
    await visible(panel(page, 'eligibility'));
    assert.equal(Number(await textOf(page, 'stat-households')), Number(beforeCount) + 1);
  });

  await test('Possible duplicate requires a supervisor review note before creating a distinct record', async page => {
    await start(page, 'new');
    await bothCaptures(page);
    if (await panel(page, 'verify').isVisible()) await byId(page, 'continue-details').click();
    await clickAction(page, 'use-demo');
    await byId(page, 'first-name').fill('Ana');
    await byId(page, 'last-name').fill('Reyes');
    await byId(page, 'birth-date').fill('1988-03-12');
    const beforeCount = Number(await textOf(page, 'stat-households'));
    await byId(page, 'beneficiary-form').locator('[type="submit"]').click();
    await visible(byId(page, 'duplicate-review'));
    await contains(byId(page, 'form-error'), /Ana Reyes|RL-0005/);
    assert.equal(Number(await textOf(page, 'stat-households')), beforeCount);
    await byId(page, 'duplicate-distinct').check();
    await byId(page, 'beneficiary-form').locator('[type="submit"]').click();
    await visible(panel(page, 'details'), 'A distinct-person decision needs its review note.');
    assert.equal(Number(await textOf(page, 'stat-households')), beforeCount);
    await byId(page, 'duplicate-note').fill('Fictional distinct-person decision for supervisor review.');
    await byId(page, 'beneficiary-form').locator('[type="submit"]').click();
    await visible(panel(page, 'eligibility'));
    assert.equal(Number(await textOf(page, 'stat-households')), beforeCount + 1);
    await contains(byId(page, 'audit-list'), /distinct|duplicate/i);
  });

  await test('A distinct beneficiary at an already served address can claim individually', async page => {
    await start(page, 'new');
    await bothCaptures(page);
    if (await panel(page, 'verify').isVisible()) await byId(page, 'continue-details').click();
    await clickAction(page, 'use-demo');
    await byId(page, 'first-name').fill('Eliza');
    await byId(page, 'last-name').fill('Santos');
    await byId(page, 'birth-date').fill('1992-09-10');
    await byId(page, 'address').fill('12 P. Sanchez Street');
    await byId(page, 'barangay').fill('Barangay 587');
    await byId(page, 'beneficiary-form').locator('[type="submit"]').click();
    await visible(panel(page, 'eligibility'));
    await contains(byId(page, 'eligibility-title'), /eligible/i);
    await enabled(byId(page, 'release-button'), 'Claim limits apply per individual, not merely to the address.');
  });

  await test('Search selection clears a prior verified identity and requires fresh captures', async page => {
    await start(page);
    await bothCaptures(page);
    await confirmProfile(page);
    await panel(page, 'eligibility').locator('[data-step="verify"]').click();
    await page.locator('.lookup-details > summary').click();
    await byId(page, 'identity-query').fill('Marites');
    await byId(page, 'identity-search-form').locator('[type="submit"]').click();
    await page.locator('[data-select-record="RL-0001"]').click();
    assert.equal(await byId(page, 'matched-profile').isVisible(), false, 'A different selected beneficiary cannot retain the prior verification.');
    await disabled(byId(page, 'continue-details'));
    await contains(byId(page, 'capture-face-status'), /awaiting/i);
    await contains(byId(page, 'capture-fingerprint-status'), /awaiting/i);
    await bothCaptures(page);
    await contains(byId(page, 'matched-profile'), /Marites Santos/);
    await confirmProfile(page);
    await disabled(byId(page, 'release-button'), 'The selected beneficiary has a current-batch claim.');
  });

  await test('Scenario change clears a prior manual verification and supervisor approval', async page => {
    await start(page);
    await byId(page, 'capture-consent').check();
    await capture(page, 'face', 'device-error');
    await page.locator('[data-capture="manual"]').click();
    await byId(page, 'manual-reference').fill('DEMO-VALID-ID-TEST-456');
    await byId(page, 'manual-reason').selectOption({ label: 'Device unavailable' });
    await byId(page, 'manual-supervisor-name').fill('Test Supervisor');
    await byId(page, 'manual-supervisor-id').fill('SUP-DEMO-TEST');
    await byId(page, 'manual-form').locator('[type="submit"]').click();
    await contains(byId(page, 'matched-profile'), /Ana Reyes/);
    await byId(page, 'profile-confirmed').check();
    await byId(page, 'capture-scenario').selectOption('RL-0001');
    assert.equal(await byId(page, 'matched-profile').isVisible(), false);
    await disabled(byId(page, 'continue-details'));
    assert.equal(await byId(page, 'profile-confirmed').isChecked(), false);
    if (await page.locator('[data-capture="manual"]').isEnabled()) await clickAction(page, 'retry-capture');
    await bothCaptures(page);
    await contains(byId(page, 'matched-profile'), /Marites Santos/);
  });

  await test('Changing actual goods requires renewed receipt acknowledgment', async page => {
    await prepare(page);
    await acknowledge(page);
    await enabled(byId(page, 'confirm-release'));
    await byId(page, 'actual-rice').fill('5');
    assert.equal(await byId(page, 'receipt-ack').isChecked(), false, 'The beneficiary must acknowledge the final quantities.');
    await byId(page, 'release-variance-reason').fill('One kilogram of rice withheld because of a damaged packet.');
    await disabled(byId(page, 'confirm-release'));
    await byId(page, 'receipt-ack').check();
    await enabled(byId(page, 'confirm-release'));
    await byId(page, 'confirm-release').click();
    await visible(byId(page, 'release-success'));
    await contains(byId(page, 'receipt-goods'), /5 kg rice/i);
  });

  for (const width of [1440, 390]) {
    await test(`Capture and release fit a ${width}px viewport`, async page => {
      await page.setViewportSize({ width, height: 1000 });
      fs.mkdirSync(artifactDir, { recursive: true });
      async function inspect(label) {
        await page.evaluate(() => window.scrollTo(0, 0));
        const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
        assert.ok(dimensions.content <= dimensions.viewport + 1, `${label} has no horizontal overflow (${dimensions.content}/${dimensions.viewport}).`);
        const imagePath = path.join(artifactDir, `${width}-${label}.png`);
        await page.screenshot({ path: imagePath, fullPage: true });
        console.log('  Screenshot ' + imagePath);
      }
      await inspect('initial');
      await start(page);
      await inspect('capture');
      await bothCaptures(page);
      await confirmProfile(page);
      await byId(page, 'release-button').click();
      await inspect('release');
      await confirmRelease(page);
      await inspect('receipt');
    });
  }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const { chromium } = loadPlaywright();
  const options = { headless: true };
  if (process.env.PLAYWRIGHT_CHANNEL) options.channel = process.env.PLAYWRIGHT_CHANNEL;
  else if (process.platform === 'win32') options.channel = 'msedge';
  browser = await chromium.launch(options);
  await runTests();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { if (browser) await browser.close(); server.close(); });
