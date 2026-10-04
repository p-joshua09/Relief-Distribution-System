(() => {
  'use strict';

  // Fictional demo records stay in memory. This app never collects biometrics.
  const TIME_ZONE = 'Asia/Manila';
  const ALLOCATED = 240;
  const PACKAGE = 'Family food package';
  const ACTIVITY = 'Habagat Response · Metro Manila 04';
  const BATCH_ID = 'HABAGAT-MM04-01';
  const BATCH_LABEL = 'MM04 · Batch 01';
  const STEPS = ['details', 'verify', 'eligibility', 'release'];
  const VIEWS = { overview: 'Overview', registration: 'Beneficiary intake', beneficiaries: 'Beneficiaries', claims: 'Claim history', inventory: 'Inventory' };
  const LEGACY = { beneficiary: 'beneficiaries', 'claim-history': 'claims', eligibility: 'registration', distribution: 'registration' };
  const $ = (id) => document.getElementById(id);
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const text = (id, value) => { if ($(id)) $(id).textContent = String(value); };
  const hidden = (id, value) => { if ($(id)) $(id).hidden = value; };
  const listen = (id, type, handler) => { if ($(id)) $(id).addEventListener(type, handler); };
  const manilaParts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (key) => manilaParts.find((item) => item.type === key).value;
  const TODAY = `${part('year')}-${part('month')}-${part('day')}`;
  const dateFormat = new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' });
  const timeFormat = new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
  const formatDate = (value) => dateFormat.format(new Date(value));
  const formatTime = (value) => timeFormat.format(new Date(value));
  const formatDateTime = (value) => `${formatDate(value)} · ${formatTime(value)} PHT`;
  const atTime = (time) => `${TODAY}T${time}:00+08:00`;
  const canonicalBarangay = (value) => {
    const match = String(value ?? '').trim().match(/^(?:(?:barangay|brgy\.?)\s*)?(\d+)$/i);
    return match ? `Barangay ${match[1]}` : String(value ?? '').trim();
  };
  const nameOf = (record) => `${record.firstName} ${record.lastName}`.trim();
  const householdKey = (record) => [record.address, canonicalBarangay(record.barangay), record.city, record.province, record.region].map(normalize).join('|');
  const statusTone = (status) => ({ ready: 'success', released: 'neutral', review: 'warning' }[status] || 'neutral');
  const statusLabel = (status) => ({ registered: 'Awaiting verification', ready: 'Ready for assessment', released: 'Released', review: 'Needs review' }[status] || 'Draft');
  const badge = (status) => `<span class="badge" data-tone="${statusTone(status)}">${statusLabel(status)}</span>`;
  const cloneMembers = (members = []) => members.map((member) => ({ ...member }));
  const FIELD_IDS = { firstName: 'first-name', lastName: 'last-name', birthDate: 'birth-date', sex: 'sex', civilStatus: 'civil-status', income: 'income', incomePeriod: 'income-period', region: 'region', province: 'province', address: 'address', barangay: 'barangay', city: 'city', householdSize: 'household-size', contact: 'contact', validId: 'valid-id' };

  const records = [
    { id: 'RL-0001', firstName: 'Marites', lastName: 'Santos', birthDate: '1982-04-17', sex: 'Female', income: 'Below ₱10,000', address: '12 P. Sanchez Street', barangay: 'Barangay 587', city: 'Manila', householdSize: 4, status: 'released', lastActivity: atTime('08:25'), members: [{ name: 'Jose Santos', relationship: 'Spouse', age: 47 }] },
    { id: 'RL-0002', firstName: 'Roberto', lastName: 'Mendoza', birthDate: '1978-07-24', sex: 'Male', income: 'Below ₱10,000', address: '18 V. Mapa Street', barangay: 'Barangay 588', city: 'Manila', householdSize: 5, status: 'released', lastActivity: atTime('09:10'), members: [{ name: 'Liza Mendoza', relationship: 'Spouse', age: 45 }] },
    { id: 'RL-0003', firstName: 'Lourdes', lastName: 'Garcia', birthDate: '1966-11-08', sex: 'Female', income: 'Below ₱10,000', address: '7 Old Sta. Mesa Street', barangay: 'Barangay 589', city: 'Manila', householdSize: 2, status: 'released', lastActivity: atTime('09:45'), members: [{ name: 'Ramon Garcia', relationship: 'Spouse', age: 62 }] },
    { id: 'RL-0004', firstName: 'Paolo', lastName: 'Rivera', birthDate: '1994-02-16', sex: 'Male', income: 'Below ₱10,000', address: '32 P. Sanchez Street', barangay: 'Barangay 587', city: 'Manila', householdSize: 3, status: 'released', lastActivity: atTime('10:20'), members: [{ name: 'Mia Rivera', relationship: 'Spouse', age: 30 }] },
    { id: 'RL-0005', firstName: 'Ana', lastName: 'Reyes', birthDate: '1988-03-12', sex: 'Female', income: 'Below ₱10,000', address: '46 V. Mapa Street', barangay: 'Barangay 588', city: 'Manila', householdSize: 4, status: 'ready', lastActivity: atTime('10:05'), members: [{ name: 'Carlo Reyes', relationship: 'Child', age: 12 }] },
    { id: 'RL-0006', firstName: 'Daniel', lastName: 'Cruz', birthDate: '1990-05-03', sex: 'Male', income: 'Below ₱10,000', address: '21 Old Sta. Mesa Street', barangay: 'Barangay 589', city: 'Manila', householdSize: 3, status: 'ready', lastActivity: atTime('09:55'), members: [{ name: 'Bea Cruz', relationship: 'Spouse', age: 34 }] },
    { id: 'RL-0007', firstName: 'Celia', lastName: 'Bautista', birthDate: '1959-12-15', sex: 'Female', income: 'Below ₱10,000', address: '54 P. Sanchez Street', barangay: 'Barangay 587', city: 'Manila', householdSize: 2, status: 'ready', lastActivity: atTime('09:30'), members: [] },
    { id: 'RL-0008', firstName: 'Mateo', lastName: 'Flores', birthDate: '1985-08-09', sex: 'Male', income: 'Below ₱10,000', address: '9 Sample Street', barangay: 'Barangay 591', city: 'Manila', householdSize: 4, status: 'review', lastActivity: atTime('09:15'), members: [] },
  ].map((record, index) => ({ ...record, region: 'National Capital Region', province: 'Metro Manila', civilStatus: 'Married', income: '7500', incomePeriod: 'monthly', contact: `sample-${index + 1}@example.invalid`, validId: '', registered: true, verified: true }));
  const claims = records.filter((record) => record.status === 'released').map((record, index) => ({
    receipt: `DEMO-R-${String(index + 1).padStart(4, '0')}`, recordId: record.id, beneficiary: nameOf(record), householdKey: householdKey(record),
    householdSize: record.householdSize, package: PACKAGE, quantity: 1, activity: ACTIVITY, batchId: BATCH_ID, batchLabel: BATCH_LABEL, releasedAt: record.lastActivity, method: 'Sample verification', personnelName: 'Maria Garcia', personnelId: 'DSWD-DEMO-04', status: 'Released',
  }));
  // A previous-batch claim demonstrates that claim limits apply to the active batch.
  claims.push({ receipt: 'DEMO-R-PREV01', recordId: 'RL-0005', beneficiary: 'Ana Reyes', householdKey: householdKey(records[4]), householdSize: 4, package: PACKAGE, quantity: 1, activity: ACTIVITY, batchId: 'HABAGAT-MM04-00', batchLabel: 'MM04 · Previous batch', releasedAt: new Date(new Date(atTime('09:00')).getTime() - 7 * 86400000).toISOString(), method: 'Sample verification', personnelName: 'Maria Garcia', personnelId: 'DSWD-DEMO-04', status: 'Released' });
  let recordSequence = records.length;
  let receiptSequence = claims.filter((claim) => claim.batchId === BATCH_ID).length;
  let toastTimer;
  let currentStep = 'details';
  let entrySelected = false;
  let intake = createIntake();
  const mobileNavigation = window.matchMedia('(max-width: 1050px)');

  function createIntake() {
    return {
      path: null, recordId: null, pendingRecordId: null, verified: false, verifiedRecordId: null, method: '', manualReason: '', captureMode: 'face', consent: false,
      detailsSaved: false, assessment: null, completed: false, receipt: null, draftSaved: false, captureComplete: false,
      fields: { firstName: '', lastName: '', birthDate: '', sex: '', civilStatus: '', income: '', incomePeriod: 'monthly', region: 'National Capital Region', province: 'Metro Manila', address: '', barangay: '', city: 'Manila', householdSize: 1, contact: '', validId: '' }, members: [],
    };
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    text('toast-message', message);
    hidden('app-toast', false);
    $('app-toast')?.classList.add('show');
    toastTimer = window.setTimeout(dismissToast, 4500);
  }
  function dismissToast() {
    clearTimeout(toastTimer);
    hidden('app-toast', true);
    $('app-toast')?.classList.remove('show');
  }
  function showError(id, message) { text(id, message); hidden(id, !message); }
  function focusHeading(container) {
    const heading = container?.querySelector('h1, h2, h3');
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  function syncSidebarAccess() {
    if ($('sidebar')) $('sidebar').inert = mobileNavigation.matches && !document.body.classList.contains('nav-open');
  }
  function closeMenu({ restoreFocus = false } = {}) {
    const wasOpen = document.body.classList.contains('nav-open');
    document.body.classList.remove('nav-open');
    $('sidebar')?.classList.remove('is-open');
    $('menu-toggle')?.setAttribute('aria-expanded', 'false');
    hidden('nav-backdrop', true);
    if (restoreFocus && wasOpen) $('menu-toggle')?.focus();
    syncSidebarAccess();
  }
  function showView(view, { updateHash = true, focus = true } = {}) {
    if (!Object.hasOwn(VIEWS, view)) view = 'overview';
    if (!entrySelected) view = 'registration';
    document.querySelectorAll('[data-view]').forEach((panel) => { panel.hidden = panel.dataset.view !== view; });
    document.querySelectorAll('[data-view-link]').forEach((link) => {
      const selected = link.dataset.viewLink === view;
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    text('page-label', VIEWS[view]);
    closeMenu();
    if (updateHash && window.location.hash !== `#${view}`) window.history.pushState(null, '', `#${view}`);
    if (view === 'registration') renderWorkflow();
    if (focus) focusHeading($(view));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function routeFromHash() {
    let hash;
    try { hash = decodeURIComponent(window.location.hash.slice(1)).toLowerCase(); } catch { hash = ''; }
    const view = LEGACY[hash] || hash;
    const safeView = !entrySelected ? 'registration' : Object.hasOwn(VIEWS, view) ? view : 'registration';
    if (window.location.hash !== `#${safeView}`) window.history.replaceState(null, '', `#${safeView}`);
    showView(safeView, { updateHash: false, focus: false });
  }
  function hasDraft() {
    return intake.verified || intake.recordId || intake.draftSaved || intake.members.length > 0 ||
      ['firstName', 'lastName', 'birthDate', 'address'].some((key) => intake.fields[key]);
  }
  function canVisitStep(step) {
    if (!intake.path) return false;
    if (intake.completed) return step === 'release';
    if (step === 'details') return intake.path === 'new' || Boolean(intake.recordId);
    if (step === 'verify') return intake.path === 'returning' || Boolean(registeredRecord() && intake.detailsSaved);
    if (step === 'eligibility') return intake.verified && intake.detailsSaved && Boolean(intake.assessment);
    if (step === 'release') return intake.completed || Boolean(intake.assessment?.eligible);
    return false;
  }
  function showStep(step, focus = true) {
    if (!STEPS.includes(step) || !canVisitStep(step)) return showToast('Complete the current step before continuing.');
    currentStep = step;
    renderWorkflow();
    if (focus) {
      const panel = document.querySelector(`[data-step-panel="${step}"]`);
      focusHeading(panel);
      panel?.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }
  function renderWorkflow() {
    hidden('registration-entry', Boolean(intake.path));
    hidden('intake-workflow', !intake.path);
    hidden('save-draft-button', !intake.path || intake.completed);
    document.body.classList.toggle('registration-first', !entrySelected);
    if (intake.path && !canVisitStep(currentStep)) currentStep = intake.completed ? 'release' : intake.path === 'returning' ? 'verify' : 'details';
    const done = { verify: intake.verified, details: intake.detailsSaved, eligibility: Boolean(intake.assessment), release: intake.completed };
    document.querySelectorAll('.step-button[data-step]').forEach((button) => {
      const step = button.dataset.step;
      const current = step === currentStep;
      const unavailable = !canVisitStep(step);
      button.classList.toggle('current', current);
      button.classList.toggle('is-current', current);
      button.classList.toggle('done', Boolean(done[step]) && !current);
      button.classList.toggle('is-complete', Boolean(done[step]) && !current);
      button.classList.toggle('disabled', unavailable);
      button.disabled = unavailable;
      button.setAttribute('aria-disabled', String(unavailable));
      if (current) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-step-panel]').forEach((panel) => { panel.hidden = panel.dataset.stepPanel !== currentStep; });
    text('workflow-progress', `Step ${STEPS.indexOf(currentStep) + 1} of 4`);
    if ($('continue-details')) $('continue-details').disabled = !intake.verified || !intake.detailsSaved;
    if ($('capture-button')) $('capture-button').disabled = !registeredRecord() || !intake.detailsSaved;
    const editRegistration = document.querySelector('[data-step-panel="verify"] [data-step="details"]');
    if (editRegistration) editRegistration.disabled = !registeredRecord();
    text('age-preview', validBirthDate(intake.fields.birthDate) ? `${ageFromBirthDate(intake.fields.birthDate)} years old` : 'Age is calculated from the date of birth.');
    renderMatchedProfile();
    hidden('match-result', !intake.captureComplete);
    renderSummary();
    renderEligibility();
    renderRelease();
  }
  function readFields() {
    const fields = { ...intake.fields };
    Object.entries(FIELD_IDS).forEach(([key, id]) => { if ($(id)) fields[key] = $(id).value.trim(); });
    fields.barangay = canonicalBarangay(fields.barangay);
    fields.householdSize = Number(fields.householdSize);
    return fields;
  }
  function assignField(id, value) {
    const field = $(id);
    if (!field) return;
    if (field.tagName === 'SELECT') {
      const options = Array.from(field.options);
      const option = options.find((item) => item.value === String(value)) || options.find((item) => normalize(item.textContent) === normalize(value)) ||
        (id === 'barangay' ? options.find((item) => canonicalBarangay(item.value) === canonicalBarangay(value)) : null);
      field.value = option ? option.value : String(value);
    } else field.value = String(value ?? '');
  }
  function writeFields() {
    Object.entries(FIELD_IDS).forEach(([key, id]) => assignField(id, intake.fields[key]));
    if ($('capture-consent')) $('capture-consent').checked = intake.consent;
    renderHousehold();
    renderSummary();
  }
  function updateDraftStatus() {
    text('draft-status', intake.completed ? 'Release recorded for this activity' : intake.draftSaved ? 'Draft saved for this session' :
      intake.detailsSaved ? 'Profile saved for this session' : hasDraft() ? 'Changes kept in this tab · save a draft to resume' : 'New intake · session only');
  }
  function invalidateAssessment() {
    intake.assessment = null;
    intake.draftSaved = false;
    if ($('receipt-ack')) $('receipt-ack').checked = false;
    showError('form-error', '');
    showError('release-error', '');
    updateDraftStatus();
    renderWorkflow();
  }
  function renderSummary() {
    const fields = intake.fields;
    text('summary-name', nameOf(fields) || 'New beneficiary');
    text('summary-id', intake.recordId || 'ID assigned after saving');
    const size = Number.isInteger(fields.householdSize) && fields.householdSize > 0 ? fields.householdSize : '—';
    text('summary-household', `${size} ${size === 1 ? 'person' : 'people'} · ${fields.barangay || 'Location pending'}`);
    text('summary-method', intake.verified ? intake.method : 'Verification pending');
    const status = intake.completed ? 'released' : intake.assessment?.status || (intake.verified ? 'draft' : 'unverified');
    text('summary-status', status === 'unverified' ? intake.detailsSaved ? 'Registered · verify at counter' : 'Registration required' : status === 'draft' ? 'Ready for claim checks' : status === 'ready' ? 'Eligible for release' : statusLabel(status));
    if ($('summary-status')) $('summary-status').dataset.tone = statusTone(status);
    updateDraftStatus();
  }
  function ageFromBirthDate(value) {
    if (!value) return null;
    const today = TODAY.split('-').map(Number);
    const birth = value.split('-').map(Number);
    if (birth.length !== 3 || birth.some((item) => !Number.isFinite(item))) return null;
    return today[0] - birth[0] - (today[1] < birth[1] || (today[1] === birth[1] && today[2] < birth[2]) ? 1 : 0);
  }
  function renderHousehold() {
    const list = $('household-list');
    if (!list) return;
    const primary = nameOf(intake.fields) || 'Primary beneficiary';
    const memberRow = (name, relationship, age, index) => {
      const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
      return `<li class="household-member"><span class="person-avatar">${escapeHTML(initials)}</span><div><strong>${escapeHTML(name)}</strong><small>${escapeHTML(relationship)}${age === null || age === '' ? '' : ` · ${escapeHTML(age)} years`}</small></div>${index === null ? '<span class="badge" data-tone="neutral">Primary</span>' : `<button type="button" class="member-remove" data-remove-member="${index}" aria-label="Remove ${escapeHTML(name)}">Remove</button>`}</li>`;
    };
    list.innerHTML = memberRow(primary, 'Primary beneficiary', ageFromBirthDate(intake.fields.birthDate), null) + intake.members.map((member, index) => memberRow(member.name, member.relationship, member.age, index)).join('');
    text('household-count', `${intake.members.length + 1} listed`);
  }
  function resetIntake(path = null) {
    intake = createIntake();
    intake.path = path;
    currentStep = path === 'returning' ? 'verify' : 'details';
    if ($('identity-query')) $('identity-query').value = '';
    if ($('identity-results')) $('identity-results').innerHTML = '';
    $('manual-form')?.reset();
    if ($('receipt-print')) $('receipt-print').innerHTML = '';
    if ($('receipt-ack')) $('receipt-ack').checked = false;
    ['verification-error', 'form-error', 'release-error'].forEach((id) => showError(id, ''));
    writeFields();
    renderCaptureMode();
    renderWorkflow();
  }
  function registeredRecord() {
    return records.find((record) => record.id === intake.recordId && record.registered);
  }
  function beginIntake(path) {
    entrySelected = true;
    resetIntake(path);
    showView('registration');
    focusHeading(document.querySelector(`[data-step-panel="${currentStep}"]`));
  }
  function prepareReturningRecord(id) {
    const record = records.find((item) => item.id === id && item.registered);
    if (!record) return;
    beginIntake('returning');
    intake.pendingRecordId = id;
    if ($('identity-query')) $('identity-query').value = id;
    renderIdentityResults([record]);
    showToast('Acknowledge the notice, select the existing profile, then verify at the counter.');
    $('capture-consent')?.focus();
  }
  function showDuplicateError(record, message) {
    showError('form-error', message);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary small';
    button.dataset.action = 'review-existing';
    button.dataset.recordId = record.id;
    button.textContent = 'Review existing registration';
    $('form-error')?.appendChild(button);
  }
  function profileChanged() {
    intake.detailsSaved = false;
    intake.verified = false;
    intake.verifiedRecordId = null;
    intake.captureComplete = false;
    intake.method = '';
    invalidateAssessment();
    renderHousehold();
  }
  function requireConsent() {
    intake.consent = Boolean($('capture-consent')?.checked);
    if (!intake.consent) {
      showError('verification-error', 'Record the privacy acknowledgment before looking up or verifying this beneficiary.');
      $('capture-consent')?.focus();
      return false;
    }
    showError('verification-error', '');
    return true;
  }
  function renderCaptureMode() {
    const manual = intake.captureMode === 'manual';
    const fingerprint = intake.captureMode === 'fingerprint';
    document.querySelectorAll('[data-capture]').forEach((button) => {
      const selected = button.dataset.capture === intake.captureMode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    hidden('capture-panel', manual);
    hidden('manual-panel', !manual);
    hidden('manual-form', !manual);
    $('scanner')?.classList.toggle('fingerprint-mode', fingerprint);
    text('scanner-label', fingerprint ? 'Fingerprint preview · no device connected' : 'Face preview · no camera access');
    text('device-state', fingerprint ? 'Demo fingerprint capture' : 'Demo face capture');
    if ($('capture-button')) $('capture-button').innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-scan"></use></svg>${fingerprint ? 'Simulate fingerprint' : 'Simulate face scan'}`;
  }
  function selectRecord(id) {
    if (!requireConsent()) return;
    const record = records.find((item) => item.id === id);
    if (!record?.registered) return;
    const mode = intake.captureMode;
    intake = createIntake();
    intake.path = 'returning';
    intake.captureMode = mode;
    intake.consent = true;
    intake.recordId = record.id;
    intake.fields = Object.fromEntries(Object.keys(FIELD_IDS).map((key) => [key, record[key]]));
    intake.members = cloneMembers(record.members);
    intake.detailsSaved = profileComplete(intake.fields, intake.members);
    writeFields();
    renderCaptureMode();
    showStep('verify');
    showToast(`Registered profile ${record.id} loaded. Verify this beneficiary at the counter.`);
  }
  function renderIdentityResults(matches) {
    const results = $('identity-results');
    if (!results) return;
    results.innerHTML = matches.length ? matches.map((record) => `<div class="identity-result"><div><strong>${escapeHTML(nameOf(record))}</strong><small>${escapeHTML(record.id)} · ${escapeHTML(record.barangay)} · sample record</small></div>${badge(record.status)}<button class="button secondary" type="button" data-select-record="${escapeHTML(record.id)}">Select record</button></div>`).join('') : '<p class="empty-state compact">No registered profile found. Choose New Registration before claiming relief goods.</p><button class="button secondary" type="button" data-action="new-registration">New Registration</button>';
  }
  function renderMatchedProfile() {
    const record = registeredRecord();
    hidden('matched-profile', !record);
    hidden('claim-history-preview', !record);
    hidden('registration-status', !intake.detailsSaved || !record);
    text('registration-status', intake.verified && intake.verifiedRecordId === record?.id ? `Demo counter verification complete · ${record.id}. Continue to the current-batch claim check.` : intake.path === 'new' ? `Registration saved · ${record?.id || ''}. Continue with identity verification at the counter.` : `Registered beneficiary · ${record?.id || ''}. The selected profile still requires counter verification.`);
    if (!record) return;
    const age = ageFromBirthDate(record.birthDate);
    if ($('matched-profile')) $('matched-profile').innerHTML = `<h3>${escapeHTML(nameOf(record))}</h3><dl class="record-facts"><div><dt>Registered profile</dt><dd>${escapeHTML(record.id)}</dd></div><div><dt>Age / date of birth</dt><dd>${age} years · ${escapeHTML(record.birthDate)}</dd></div><div><dt>Location</dt><dd>${escapeHTML(record.address)}, ${escapeHTML(record.barangay)}, ${escapeHTML(record.city)}, ${escapeHTML(record.province)}, ${escapeHTML(record.region)}</dd></div><div><dt>Sex / gender · civil status</dt><dd>${escapeHTML(record.sex)} · ${escapeHTML(record.civilStatus)}</dd></div><div><dt>Household</dt><dd>${record.householdSize} people · ₱${Number(record.income).toLocaleString('en-PH')} ${escapeHTML(record.incomePeriod)}</dd></div><div><dt>Contact</dt><dd>${escapeHTML(record.contact)}</dd></div></dl>`;
    const history = claims.filter((claim) => claim.recordId === record.id || claim.householdKey === householdKey(record)).sort((a, b) => new Date(b.releasedAt) - new Date(a.releasedAt));
    if ($('claim-history-preview')) $('claim-history-preview').innerHTML = `<h3>Registered household claim history</h3><p class="field-hint">Active batch: ${escapeHTML(BATCH_LABEL)}. Earlier batches do not block this batch.</p>${history.length ? `<ul class="claim-history-list">${history.map((claim) => `<li><strong>${escapeHTML(claim.receipt)}</strong><span class="badge" data-tone="${claim.batchId === BATCH_ID ? 'warning' : 'neutral'}">${claim.batchId === BATCH_ID ? 'Current batch · already claimed' : 'Previous batch'}</span><small>${escapeHTML(claim.batchLabel)} · ${escapeHTML(formatDateTime(claim.releasedAt))}</small><small>${claim.quantity} × ${escapeHTML(claim.package)} · ${escapeHTML(claim.personnelName)}</small></li>`).join('')}</ul>` : '<p class="empty-state compact">No previous releases recorded for this registered household.</p>'}`;
  }
  function withinCoverage(record) {
    return ['national capital region', 'ncr'].includes(normalize(record.region)) && normalize(record.province) === 'metro manila' && normalize(record.city) === 'manila' && ['Barangay 587', 'Barangay 588', 'Barangay 589'].includes(canonicalBarangay(record.barangay));
  }
  function hasHouseholdClaim(record, id = record.id) {
    return claims.some((claim) => claim.batchId === BATCH_ID && (claim.recordId === id || claim.householdKey === householdKey(record)));
  }
  function currentClaims() { return claims.filter((claim) => claim.batchId === BATCH_ID); }
  function availablePackages() { return Math.max(0, ALLOCATED - currentClaims().reduce((total, claim) => total + claim.quantity, 0)); }
  function validBirthDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > TODAY) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  function profileComplete(fields, members = []) {
    return ['firstName', 'lastName', 'sex', 'civilStatus', 'region', 'province', 'address', 'barangay', 'city', 'contact'].every((key) => Boolean(String(fields[key] ?? '').trim())) && String(fields.income ?? '').trim() !== '' && Number.isFinite(Number(fields.income)) && Number(fields.income) >= 0 && ['monthly', 'annual'].includes(fields.incomePeriod) && validBirthDate(fields.birthDate) && Number.isInteger(fields.householdSize) && fields.householdSize >= members.length + 1 && fields.householdSize >= 1 && fields.householdSize <= 20;
  }
  function assess(fields, id, members) {
    const claimed = hasHouseholdClaim(fields, id);
    const complete = profileComplete(fields, members);
    const coverage = withinCoverage(fields);
    const available = availablePackages();
    const registered = records.find((record) => record.id === id && record.registered);
    const verified = Boolean(registered && intake.verified && intake.verifiedRecordId === id);
    const rules = [
      { title: 'Registration on file', passed: Boolean(registered && profileComplete(registered, registered.members) && intake.detailsSaved), description: registered && intake.detailsSaved ? `Registered beneficiary ${id}; profile saved before verification.` : 'Save a complete registered profile before claiming relief goods.' },
      { title: 'Identity verification', passed: verified, description: verified ? `${intake.method}${intake.manualReason ? ` · Reason: ${intake.manualReason}` : ''}` : 'Select a registered profile, acknowledge the notice, and complete counter verification.' },
      { title: 'Household profile', passed: complete, description: complete ? `${fields.householdSize} ${fields.householdSize === 1 ? 'person' : 'people'} declared; required details are complete.` : 'Complete required details and check the household size.' },
      { title: 'Activity coverage', passed: coverage, description: coverage ? `${fields.barangay}, Manila is within this demo activity.` : 'This demo activity covers Manila barangays 587, 588 and 589. Refer other locations to the station lead.' },
      { title: 'Current batch claim history', passed: !claimed, description: claimed ? `This beneficiary or household already received a package in ${BATCH_LABEL}. Another release is blocked.` : `No release recorded for this beneficiary or household in ${BATCH_LABEL}. Earlier batches do not affect this check.` },
      { title: 'Package availability', passed: available > 0, description: available > 0 ? `${available} family food packages available. One package is assigned per household.` : 'No packages remain. A release cannot be recorded.' },
    ];
    const eligible = rules.every((rule) => rule.passed);
    return { rules, eligible, status: claimed ? 'released' : eligible ? 'ready' : 'review' };
  }
  function renderEligibility() {
    const result = intake.assessment;
    if ($('eligibility-banner')) $('eligibility-banner').dataset.tone = result ? result.eligible ? 'success' : result.status === 'released' ? 'danger' : 'warning' : 'neutral';
    text('eligibility-title', !result ? 'Assessment pending' : result.eligible ? 'Eligible for one relief package' : result.status === 'released' ? 'Household already served' : 'Station review required');
    text('eligibility-description', !result ? 'Save a verified household profile to assess the demo rules.' : result.eligible ? 'All demo policy checks passed. Review the package and confirm receipt before recording the release.' : result.status === 'released' ? 'A claim already exists in this activity. View claim history for the recorded handover.' : 'Review the checks below with your station lead. This prototype does not offer eligibility overrides.');
    if ($('rule-list')) $('rule-list').innerHTML = result ? result.rules.map((rule) => `<div class="rule-row"><span class="rule-icon" data-tone="${rule.passed ? 'success' : 'warning'}" aria-hidden="true">${rule.passed ? '✓' : '!'}</span><div><strong>${escapeHTML(rule.title)}</strong><small>${escapeHTML(rule.description)}</small></div><span class="badge" data-tone="${rule.passed ? 'success' : 'warning'}">${rule.passed ? 'Passed' : 'Review'}</span></div>`).join('') : '';
    if ($('release-button')) $('release-button').disabled = !result?.eligible || intake.completed;
  }
  function renderRelease() {
    text('release-name', nameOf(intake.fields) || 'Beneficiary');
    text('release-household', `${intake.fields.householdSize || '—'} people · ${intake.fields.barangay || 'Location pending'}`);
    text('release-record-id', intake.recordId || 'Not saved');
    text('release-method', intake.method || 'Verification pending');
    text('release-batch', BATCH_LABEL);
    hidden('release-content', intake.completed);
    hidden('release-success', !intake.completed);
    const personnelReady = Boolean($('personnel-name')?.value.trim() && $('personnel-id')?.value.trim());
    if ($('confirm-release')) $('confirm-release').disabled = intake.completed || !intake.assessment?.eligible || !$('receipt-ack')?.checked || !personnelReady;
    if (intake.receipt) {
      text('receipt-number', intake.receipt.receipt);
      text('receipt-beneficiary', intake.receipt.beneficiary);
      text('receipt-time', formatDateTime(intake.receipt.releasedAt));
      text('receipt-personnel', `${intake.receipt.personnelName} · ${intake.receipt.personnelId}`);
      text('receipt-batch', intake.receipt.batchLabel);
      renderPrintableReceipt(intake.receipt);
    }
  }
  function renderPrintableReceipt(receipt) {
    if (!$('receipt-print')) return;
    $('receipt-print').innerHTML = `<div class="receipt-print-inner"><div class="receipt-branding"><img class="receipt-dswd-logo" src="assets/branding/dswd-logo.png" alt="Department of Social Welfare and Development" width="939" height="265" /><img class="receipt-bagong-logo" src="assets/branding/bagong-pilipinas-logo.png" alt="Bagong Pilipinas" width="692" height="648" /></div><p>DSWD relief distribution · demonstration receipt</p><h1>Relief package acknowledgment</h1><p>This is a fictional prototype transaction.</p><dl><dt>Receipt</dt><dd>${escapeHTML(receipt.receipt)}</dd><dt>Beneficiary</dt><dd>${escapeHTML(receipt.beneficiary)}</dd><dt>Sample record ID</dt><dd>${escapeHTML(receipt.recordId)}</dd><dt>Activity / batch</dt><dd>${escapeHTML(receipt.activity)} · ${escapeHTML(receipt.batchLabel)}</dd><dt>Package</dt><dd>${escapeHTML(receipt.quantity)} × ${escapeHTML(receipt.package)}</dd><dt>Released</dt><dd>${escapeHTML(formatDateTime(receipt.releasedAt))}</dd><dt>Personnel in charge</dt><dd>${escapeHTML(receipt.personnelName)} · ${escapeHTML(receipt.personnelId)}</dd></dl><p>Receipt acknowledgment confirmed by the operator in this demo.</p></div>`;
  }
  function synchronizeStatuses() {
    records.forEach((record) => { record.status = hasHouseholdClaim(record) ? 'released' : !record.verified ? 'registered' : profileComplete(record, record.members) && withinCoverage(record) && availablePackages() > 0 ? 'ready' : 'review'; });
  }
  function tableName(record) { return `<strong>${escapeHTML(nameOf(record))}</strong><small>${escapeHTML(record.id)} · sample record</small>`; }
  function openButton(record) { return `<button class="table-action" type="button" data-open-record="${escapeHTML(record.id)}" aria-label="View ${escapeHTML(nameOf(record))}">View <span aria-hidden="true">↗</span></button>`; }
  function setProgress(id, percent) {
    const element = $(id);
    if (!element) return;
    const value = Math.max(0, Math.min(100, percent));
    element.style.width = `${value}%`;
    element.style.setProperty('--progress', `${value}%`);
    element.setAttribute('role', 'progressbar');
    element.setAttribute('aria-label', id === 'hero-progress' ? 'Allocated packages released' : 'Allocated packages available');
    element.setAttribute('aria-valuemin', '0');
    element.setAttribute('aria-valuemax', '100');
    element.setAttribute('aria-valuenow', String(Math.round(value)));
  }
  function renderDashboard() {
    const batchClaims = currentClaims();
    const released = batchClaims.reduce((total, claim) => total + claim.quantity, 0);
    const available = availablePackages();
    text('stat-households', records.length);
    text('stat-released', released);
    text('stat-ready', records.filter((record) => record.status === 'ready').length);
    text('stat-review', records.filter((record) => ['registered', 'review'].includes(record.status)).length);
    setProgress('hero-progress', released / ALLOCATED * 100);
    text('hero-progress-label', `${released} of ${ALLOCATED} packages released`);
    text('stock-count', available);
    setProgress('stock-progress', available / ALLOCATED * 100);
    text('stock-detail', `${available} available · ${released} released today`);
    const recent = [...records].sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity)).slice(0, 5);
    if ($('recent-beneficiaries')) $('recent-beneficiaries').innerHTML = recent.map((record) => `<tr><td>${tableName(record)}</td><td>${escapeHTML(record.barangay)}</td><td>${record.householdSize}</td><td>${badge(record.status)}</td><td>${openButton(record)}</td></tr>`).join('');
    text('recent-count', `${recent.length} recent households`);
    const latest = [...batchClaims].sort((a, b) => new Date(b.releasedAt) - new Date(a.releasedAt)).slice(0, 3);
    if ($('activity-feed')) $('activity-feed').innerHTML = latest.map((claim) => `<li><span class="activity-mark"><svg class="icon" aria-hidden="true"><use href="#i-package"></use></svg></span><div><strong>Package released to ${escapeHTML(claim.beneficiary)}</strong><small>${escapeHTML(claim.receipt)} · ${escapeHTML(claim.recordId)}</small></div><time datetime="${escapeHTML(claim.releasedAt)}">${escapeHTML(formatTime(claim.releasedAt))}</time></li>`).join('');
    const hourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' });
    const hours = new Set(Array.from({ length: 8 }, (_, index) => index + 8));
    batchClaims.forEach((claim) => hours.add(Number(hourFormatter.format(new Date(claim.releasedAt)))));
    const hourly = [...hours].sort((a, b) => a - b).map((hour) => ({ hour, count: 0 }));
    batchClaims.forEach((claim) => { const bucket = hourly.find((item) => item.hour === Number(hourFormatter.format(new Date(claim.releasedAt)))); if (bucket) bucket.count += claim.quantity; });
    const max = Math.max(4, Math.ceil(Math.max(...hourly.map((item) => item.count)) / 4) * 4);
    const axis = document.querySelector('.chart-axis');
    if (axis) axis.innerHTML = Array.from({ length: 5 }, (_, index) => `<span>${max - index * max / 4}</span>`).join('');
    if ($('hourly-chart')) $('hourly-chart').innerHTML = hourly.map((item) => `<div class="chart-column" aria-label="${String(item.hour).padStart(2, '0')}:00: ${item.count} packages"><div class="chart-bar${item.count ? '' : ' empty'}" style="--bar-height: ${item.count / max * 100}%" title="${item.count} packages"></div><span>${String(item.hour).padStart(2, '0')}</span></div>`).join('');
    if ($('hourly-chart')) $('hourly-chart').setAttribute('aria-label', `Packages released by hour today: ${hourly.map((item) => `${String(item.hour).padStart(2, '0')}:00, ${item.count}`).join('; ')}.`);
    if ($('chart-total')) $('chart-total').innerHTML = `${released} <span>packages released</span>`;
  }
  function renderDirectory() {
    const query = normalize($('beneficiary-search')?.value);
    const filter = $('beneficiary-status')?.value || 'all';
    const matches = [...records].filter((record) => (!query || normalize(`${nameOf(record)} ${record.id} ${record.barangay}`).includes(query)) && (filter === 'all' || record.status === filter)).sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    if ($('beneficiaries-table')) $('beneficiaries-table').innerHTML = matches.length ? matches.map((record) => `<tr><td>${tableName(record)}</td><td>${escapeHTML(record.barangay)}<small>${escapeHTML(record.city)}</small></td><td>${record.householdSize} ${record.householdSize === 1 ? 'person' : 'people'}</td><td>${badge(record.status)}</td><td>${escapeHTML(formatDateTime(record.lastActivity))}</td><td>${openButton(record)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No sample households match these filters. Try another name or status.</td></tr>';
    text('beneficiary-count', `${matches.length} of ${records.length} households`);
  }
  function renderClaims() {
    const query = normalize($('claims-search')?.value);
    const matches = [...claims].filter((claim) => !query || normalize(`${claim.receipt} ${claim.beneficiary} ${claim.recordId} ${claim.batchLabel} ${claim.personnelName} ${claim.personnelId}`).includes(query)).sort((a, b) => new Date(b.releasedAt) - new Date(a.releasedAt));
    if ($('claims-table')) $('claims-table').innerHTML = matches.length ? matches.map((claim) => `<tr><td><strong class="record-id">${escapeHTML(claim.receipt)}</strong></td><td><strong>${escapeHTML(claim.beneficiary)}</strong><small>${escapeHTML(claim.recordId)} · sample record</small></td><td>${escapeHTML(claim.package)}<small>Quantity: ${claim.quantity}</small></td><td>${escapeHTML(formatDate(claim.releasedAt))}<small>${escapeHTML(formatTime(claim.releasedAt))} PHT</small></td><td>${escapeHTML(claim.personnelName)}<small>${escapeHTML(claim.personnelId)}</small></td><td>${escapeHTML(claim.batchLabel)}<small>${claim.batchId === BATCH_ID ? 'Current batch' : 'Previous batch'}</small></td><td><span class="badge" data-tone="success">Recorded</span></td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">No demo claims match your search.</td></tr>';
    text('claims-count', `${matches.length} ${matches.length === 1 ? 'claim' : 'claims'}${query ? ` of ${claims.length}` : ' recorded'}`);
  }
  function renderInventory() {
    const available = availablePackages();
    text('inventory-available', available);
    text('inventory-released', ALLOCATED - available);
    text('inventory-total', ALLOCATED);
    setProgress('inventory-progress', available / ALLOCATED * 100);
    text('inventory-remaining', `${available} of ${ALLOCATED} packages available`);
  }
  function renderAll() {
    synchronizeStatuses();
    renderDashboard();
    renderDirectory();
    renderClaims();
    renderInventory();
    renderHousehold();
    renderWorkflow();
  }
  function openDialog(id) {
    const dialog = $(id);
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  function closeDialog(dialog) { if (!dialog) return; if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
  function openRecord(id) {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    text('record-dialog-title', nameOf(record));
    const history = claims.filter((claim) => claim.recordId === id || claim.householdKey === householdKey(record));
    if ($('record-dialog-content')) $('record-dialog-content').innerHTML = `<div class="record-dialog-summary">${badge(record.status)}<span class="record-id">${escapeHTML(record.id)} · fictional sample</span></div><dl class="record-facts"><div><dt>Location</dt><dd>${escapeHTML(record.barangay)}, ${escapeHTML(record.city)}, ${escapeHTML(record.province)}, ${escapeHTML(record.region)}</dd></div><div><dt>Household</dt><dd>${record.householdSize} ${record.householdSize === 1 ? 'person' : 'people'}</dd></div><div><dt>Last activity</dt><dd>${escapeHTML(formatDateTime(record.lastActivity))}</dd></div></dl><h3>Recorded claim history</h3>${history.length ? `<ul class="record-claims">${history.map((claim) => `<li><strong>${escapeHTML(claim.receipt)} · ${escapeHTML(claim.batchLabel)}</strong><small>${escapeHTML(claim.package)} · ${escapeHTML(formatDateTime(claim.releasedAt))}</small><small>${escapeHTML(claim.personnelName)} · ${escapeHTML(claim.personnelId)}</small></li>`).join('')}</ul>` : '<p class="empty-state compact">No package releases recorded for this household.</p>'}`;
    if ($('record-continue')) {
      $('record-continue').dataset.recordId = id;
      $('record-continue').textContent = record.status === 'released' ? 'Verify and review record' : 'Continue to verification';
    }
    openDialog('record-dialog');
  }
  function exportClaims() {
    const safeCSV = (value) => { let cell = String(value ?? ''); if (/^[\s]*[=+\-@\t\r]/.test(cell)) cell = `'${cell}`; return `"${cell.replace(/"/g, '""')}"`; };
    const rows = [['Demo receipt', 'Sample record ID', 'Activity', 'Batch ID', 'Batch', 'Package', 'Quantity', 'Released at (ISO)', 'Personnel in charge', 'Personnel ID', 'Status'], ...claims.map((claim) => [claim.receipt, claim.recordId, claim.activity, claim.batchId, claim.batchLabel, claim.package, claim.quantity, claim.releasedAt, claim.personnelName, claim.personnelId, claim.status])];
    const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(safeCSV).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dswd-demo-claims-${TODAY}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${claims.length} demo claims. The CSV excludes beneficiary names and addresses.`);
  }
  const actions = {
    'new-registration': () => beginIntake('new'),
    'returning-beneficiary': () => beginIntake('returning'),
    'review-existing': (button) => prepareReturningRecord(button.dataset.recordId),
    'start-registration': () => {
      if (intake.completed) resetIntake(); else if (hasDraft()) showToast('Your current intake has been resumed.');
      showView('registration');
      focusHeading(intake.path ? document.querySelector(`[data-step-panel="${currentStep}"]`) : $('registration-entry'));
    },
    'save-draft': () => {
      if (intake.completed) return showToast('This release is complete. Start the next intake for a new beneficiary.');
      if (!intake.path) return;
      intake.fields = readFields(); intake.draftSaved = true; updateDraftStatus(); showToast('Draft saved in this tab. Return to intake to resume.');
    },
    'use-demo': () => {
      if (intake.completed) return showToast('Start the next intake to enter a new beneficiary.');
      if (intake.path !== 'new' || intake.recordId) return showToast('Sample autofill is available for an unsaved new registration.');
      showToast('Fictional sample details loaded. Review and save the registration before verification.');
      intake.fields = { firstName: 'Elena', lastName: 'Dela Cruz', birthDate: '1991-06-14', sex: 'Female', civilStatus: 'Married', income: '7500', incomePeriod: 'monthly', region: 'National Capital Region', province: 'Metro Manila', address: '24 P. Sanchez Street', barangay: 'Barangay 587', city: 'Manila', householdSize: 3, contact: 'elena@example.invalid', validId: '' };
      intake.members = [{ name: 'Miguel Dela Cruz', relationship: 'Spouse', age: 37 }, { name: 'Sofia Dela Cruz', relationship: 'Child', age: 9 }];
      writeFields(); profileChanged();
    },
    'add-member': () => { if (intake.completed) return; if (intake.members.length >= 19) return showToast('A household can contain up to 20 people in this demo.'); $('member-form')?.reset(); openDialog('member-dialog'); },
    'cancel-intake': () => { entrySelected = false; resetIntake(); showView('registration'); showToast('Intake cleared. Choose New Registration or the verification counter.'); },
    'export-claims': exportClaims,
    'print-receipt': () => { if (!intake.receipt) return showToast('Record a release before printing a receipt.'); renderPrintableReceipt(intake.receipt); window.print(); },
    'show-help': () => openDialog('help-dialog'),
    'close-dialog': (button) => closeDialog(button.closest('dialog')),
  };
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button, a, [data-action]');
    if (!button) return;
    if (button.classList.contains('skip-link')) {
      event.preventDefault();
      $('main-content')?.focus();
      $('main-content')?.scrollIntoView({ block: 'start' });
      return;
    }
    if (button.hasAttribute('data-action') && actions[button.dataset.action]) { event.preventDefault(); actions[button.dataset.action](button); }
    else if (button.hasAttribute('data-view-link')) { event.preventDefault(); showView(button.dataset.viewLink); }
    else if (button.hasAttribute('data-step')) showStep(button.dataset.step);
    else if (button.hasAttribute('data-capture')) {
      if (!['face', 'fingerprint', 'manual'].includes(button.dataset.capture)) return;
      if (intake.completed) return;
      if (intake.captureMode !== button.dataset.capture) {
        intake.verified = false; intake.verifiedRecordId = null; intake.captureComplete = false; intake.method = ''; intake.manualReason = '';
        invalidateAssessment(); currentStep = 'verify';
      }
      intake.captureMode = button.dataset.capture; renderCaptureMode(); renderWorkflow();
    } else if (button.hasAttribute('data-select-record')) selectRecord(button.dataset.selectRecord);
    else if (button.hasAttribute('data-open-record')) openRecord(button.dataset.openRecord);
    else if (button.hasAttribute('data-remove-member')) {
      if (intake.completed) return;
      const index = Number(button.dataset.removeMember);
      if (!Number.isInteger(index) || index < 0 || index >= intake.members.length) return;
      intake.members.splice(index, 1); profileChanged();
      showToast('Household member removed. Review the declared household size.');
    }
  });
  listen('menu-toggle', 'click', () => {
    const opened = $('menu-toggle').getAttribute('aria-expanded') !== 'true';
    document.body.classList.toggle('nav-open', opened);
    $('sidebar')?.classList.toggle('is-open', opened);
    $('menu-toggle').setAttribute('aria-expanded', String(opened));
    hidden('nav-backdrop', !opened);
    syncSidebarAccess();
    if (opened) $('sidebar')?.querySelector('.nav-item')?.focus();
  });
  listen('nav-backdrop', 'click', () => closeMenu({ restoreFocus: true }));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu({ restoreFocus: true });
    if (event.key === 'Tab' && mobileNavigation.matches && document.body.classList.contains('nav-open')) {
      const links = Array.from($('sidebar').querySelectorAll('a[href], button:not([disabled])'));
      const first = links[0];
      const last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  mobileNavigation.addEventListener('change', () => { closeMenu(); syncSidebarAccess(); });
  listen('toast-close', 'click', dismissToast);
  listen('capture-consent', 'change', () => {
    intake.consent = $('capture-consent').checked;
    if (!intake.consent) {
      intake.verified = false; intake.verifiedRecordId = null; intake.captureComplete = false; invalidateAssessment(); currentStep = 'verify'; renderWorkflow();
    } else showError('verification-error', '');
  });
  listen('identity-search-form', 'submit', (event) => {
    event.preventDefault();
    if (!requireConsent()) return;
    const query = normalize($('identity-query')?.value);
    if (!query) { showError('verification-error', 'Enter a sample beneficiary name or ID to search.'); $('identity-query')?.focus(); return; }
    renderIdentityResults(records.filter((record) => normalize(nameOf(record)).includes(query) || normalize(record.id).includes(query) || record.members.some((member) => normalize(member.name).includes(query))));
  });
  listen('capture-button', 'click', () => {
    if (!requireConsent()) return;
    const record = registeredRecord();
    if (!record || !intake.detailsSaved || !profileComplete(record, record.members)) {
      showError('verification-error', 'Select a saved registered profile first. New beneficiaries must complete registration before counter verification.');
      return;
    }
    const mode = intake.captureMode;
    intake.verified = true;
    intake.verifiedRecordId = record.id;
    intake.method = mode === 'fingerprint' ? 'Demo fingerprint verification' : 'Demo face verification';
    intake.captureComplete = true; intake.pendingRecordId = null;
    record.verified = true;
    invalidateAssessment(); renderCaptureMode(); renderWorkflow();
    text('capture-result-status', `Demo verification completed for registered profile ${record.id}. Profile and claim history loaded; no real biometric matching is performed.`);
    showToast('Demo identity verification complete. Continue to the current-batch claim check.');
    $('continue-details')?.focus();
  });
  listen('continue-details', 'click', () => {
    if (!registeredRecord() || !intake.detailsSaved || !intake.verified || intake.verifiedRecordId !== intake.recordId) return showToast('Complete registration and verify the selected beneficiary first.');
    intake.assessment = assess(intake.fields, intake.recordId, intake.members);
    renderAll(); showStep('eligibility');
  });
  if ($('manual-form')) $('manual-form').noValidate = true;
  listen('manual-form', 'submit', (event) => {
    event.preventDefault();
    if (!requireConsent()) return;
    const reference = $('manual-reference')?.value.trim() || '';
    const reason = $('manual-reason')?.value.trim() || '';
    if (!reference || !reason) { showError('verification-error', 'Provide a supporting reference and a reason for manual verification.'); (!reference ? $('manual-reference') : $('manual-reason'))?.focus(); return; }
    const record = registeredRecord();
    if (!record) { showError('verification-error', 'Select an existing registered beneficiary before recording a supporting document. New beneficiaries must complete registration first.'); return; }
    if (!intake.detailsSaved || !profileComplete(record, record.members)) { showError('verification-error', 'Complete and save this registered household profile before verification.'); return; }
    intake.verified = true; intake.verifiedRecordId = record.id; record.verified = true; intake.method = `Manual verification · ${reference}`; intake.manualReason = reason; intake.captureComplete = false;
    invalidateAssessment(); renderWorkflow(); showToast('Manual counter verification recorded. Continue to the current-batch claim check.');
  });
  if ($('birth-date')) $('birth-date').max = TODAY;
  if ($('beneficiary-form')) $('beneficiary-form').noValidate = true;
  const handleDetailsEdit = () => { if (intake.completed) return; intake.fields = readFields(); profileChanged(); };
  listen('beneficiary-form', 'input', handleDetailsEdit);
  listen('beneficiary-form', 'change', handleDetailsEdit);
  listen('beneficiary-form', 'submit', (event) => {
    event.preventDefault();
    if (intake.completed) return;
    if (!intake.path) return;
    const fields = readFields();
    intake.fields = fields;
    const required = [['firstName', 'First and middle names'], ['lastName', 'Last name'], ['birthDate', 'Date of birth'], ['sex', 'Sex / gender'], ['civilStatus', 'Civil status'], ['region', 'Region'], ['province', 'Province'], ['address', 'Street / sitio'], ['barangay', 'Barangay'], ['city', 'City / municipality'], ['income', 'Household income'], ['incomePeriod', 'Income period'], ['contact', 'Contact information']];
    const missing = required.find(([key]) => !fields[key]);
    if (missing) { showError('form-error', `${missing[1]} is required. Complete the household profile to continue.`); $(FIELD_IDS[missing[0]])?.focus(); return; }
    if (!validBirthDate(fields.birthDate)) { showError('form-error', 'Enter a valid birth date on or before today.'); $('birth-date')?.focus(); return; }
    if (!Number.isFinite(Number(fields.income)) || Number(fields.income) < 0 || !['monthly', 'annual'].includes(fields.incomePeriod)) { showError('form-error', 'Enter household income of zero or more and select monthly or annual.'); $('income')?.focus(); return; }
    if (!Number.isInteger(fields.householdSize) || fields.householdSize < 1 || fields.householdSize > 20 || fields.householdSize < intake.members.length + 1) {
      showError('form-error', `Household size must be between 1 and 20 and include all ${intake.members.length + 1} listed people.`); $('household-size')?.focus(); return;
    }
    const listedNames = [nameOf(fields), ...intake.members.map((member) => member.name)].map(normalize);
    if (new Set(listedNames).size !== listedNames.length) {
      showError('form-error', 'The primary beneficiary and linked members must be different people. Review duplicate names in this household.'); return;
    }
    const personDuplicate = records.find((record) => record.id !== intake.recordId && normalize(nameOf(record)) === normalize(nameOf(fields)) && record.birthDate === fields.birthDate);
    const householdDuplicate = records.find((record) => record.id !== intake.recordId && householdKey(record) === householdKey(fields));
    const linkedMemberDuplicate = records.find((record) => record.id !== intake.recordId && record.members.some((member) => normalize(member.name) === normalize(nameOf(fields))));
    const validIdDuplicate = fields.validId ? records.find((record) => record.id !== intake.recordId && record.validId && normalize(record.validId) === normalize(fields.validId)) : null;
    if (linkedMemberDuplicate) {
      showDuplicateError(linkedMemberDuplicate, `This name matches a linked member of registered household ${linkedMemberDuplicate.id}. Review the existing household before creating another registration.`); return;
    }
    if (personDuplicate || householdDuplicate || validIdDuplicate) {
      const duplicate = personDuplicate || householdDuplicate || validIdDuplicate;
      showDuplicateError(duplicate, `${personDuplicate ? 'This name and birth date match' : householdDuplicate ? 'This address matches' : 'This ID matches'} registered household ${duplicate.id}. Review the existing profile to avoid a duplicate.`); return;
    }
    showError('form-error', '');
    if (!intake.recordId) intake.recordId = `RL-${String(++recordSequence).padStart(4, '0')}`;
    intake.detailsSaved = true; intake.draftSaved = false; intake.assessment = null; intake.verified = false; intake.verifiedRecordId = null; intake.captureComplete = false; intake.method = '';
    const saved = { ...fields, id: intake.recordId, members: cloneMembers(intake.members), registered: true, verified: false, status: 'review', lastActivity: new Date().toISOString() };
    const existing = records.findIndex((record) => record.id === intake.recordId);
    if (existing === -1) records.push(saved); else records[existing] = { ...records[existing], ...saved };
    renderAll(); showStep('verify');
    showToast(`Registration saved as ${intake.recordId}. Continue with verification at the distribution counter.`);
  });
  listen('member-form', 'submit', (event) => {
    event.preventDefault();
    if (intake.completed) return;
    const name = $('member-name')?.value.trim() || '';
    const relationship = $('member-relationship')?.value.trim() || '';
    const ageValue = $('member-age')?.value.trim() || '';
    const age = ageValue === '' ? null : Number(ageValue);
    if (!name || !relationship || (age !== null && (!Number.isInteger(age) || age < 0 || age > 120))) {
      showToast('Enter a name, relationship, and a valid age between 0 and 120.'); (!name ? $('member-name') : !relationship ? $('member-relationship') : $('member-age'))?.focus(); return;
    }
    if (intake.members.length >= 19) return showToast('A household can contain up to 20 people.');
    if (normalize(name) === normalize(nameOf(intake.fields)) || intake.members.some((member) => normalize(member.name) === normalize(name))) {
      showToast('This person is already listed in the household.'); $('member-name')?.focus(); return;
    }
    const otherHousehold = records.find((record) => record.id !== intake.recordId && (normalize(nameOf(record)) === normalize(name) || record.members.some((member) => normalize(member.name) === normalize(name))));
    if (otherHousehold) {
      showToast(`Possible match in household ${otherHousehold.id}. Ask the station lead to review before linking this person.`); $('member-name')?.focus(); return;
    }
    intake.members.push({ name, relationship, age });
    intake.fields.householdSize = Math.max(intake.members.length + 1, Number(intake.fields.householdSize) || 1);
    assignField('household-size', intake.fields.householdSize);
    closeDialog($('member-dialog')); profileChanged();
    showToast('Household member added. Review the declared household size.');
  });
  listen('release-button', 'click', () => {
    if (!intake.assessment?.eligible || intake.completed) return;
    intake.assessment = assess(intake.fields, intake.recordId, intake.members);
    if (!intake.assessment.eligible) { renderEligibility(); showToast('The release is blocked. Review the updated eligibility checks.'); return; }
    showStep('release');
  });
  listen('receipt-ack', 'change', renderRelease);
  listen('personnel-name', 'input', renderRelease);
  listen('personnel-id', 'input', renderRelease);
  listen('confirm-release', 'click', () => {
    if (intake.completed) return;
    const registered = registeredRecord();
    if (!registered || !intake.verified || intake.verifiedRecordId !== registered.id || !intake.detailsSaved || !intake.assessment?.eligible || !$('receipt-ack')?.checked) {
      showError('release-error', 'Complete eligibility and confirm the beneficiary acknowledgment before recording release.'); return;
    }
    const personnelName = $('personnel-name')?.value.trim() || '';
    const personnelId = $('personnel-id')?.value.trim() || '';
    if (!personnelName || !personnelId) { showError('release-error', 'Record the name and staff ID of the DSWD personnel releasing these goods.'); (!personnelName ? $('personnel-name') : $('personnel-id'))?.focus(); return; }
    const latest = assess(intake.fields, intake.recordId, intake.members);
    if (!latest.eligible) { intake.assessment = latest; showError('release-error', 'This release is blocked. Review the eligibility checks.'); showStep('eligibility'); return; }
    // Set the guard synchronously before adding the transaction.
    intake.completed = true;
    const receipt = { receipt: `DEMO-R-${String(++receiptSequence).padStart(4, '0')}`, recordId: registered.id, beneficiary: nameOf(registered), householdKey: householdKey(registered), householdSize: registered.householdSize, package: PACKAGE, quantity: 1, activity: ACTIVITY, batchId: BATCH_ID, batchLabel: BATCH_LABEL, releasedAt: new Date().toISOString(), method: intake.method, personnelName, personnelId, status: 'Released' };
    claims.push(receipt); intake.receipt = receipt;
    const record = records.find((item) => item.id === intake.recordId);
    if (record) { record.status = 'released'; record.lastActivity = receipt.releasedAt; }
    showError('release-error', ''); renderAll(); currentStep = 'release'; renderWorkflow(); focusHeading($('release-success'));
    $('release-success')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    showToast('Demo release recorded. Claim history and available stock have been updated.');
  });
  listen('record-continue', 'click', () => {
    const id = $('record-continue').dataset.recordId;
    const record = records.find((item) => item.id === id);
    if (!record) return;
    closeDialog($('record-dialog')); prepareReturningRecord(id);
  });
  listen('beneficiary-search', 'input', renderDirectory);
  listen('beneficiary-status', 'change', renderDirectory);
  listen('claims-search', 'input', renderClaims);
  window.addEventListener('hashchange', routeFromHash);
  window.addEventListener('popstate', routeFromHash);

  writeFields(); renderCaptureMode(); renderAll(); routeFromHash(); syncSidebarAccess();
})();
