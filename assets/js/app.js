(async () => {
  'use strict';

  // PostgreSQL is authoritative. Face and fingerprint capture remain explicitly simulated.
  const TIME_ZONE = 'Asia/Manila';
  let currentUser = null, csrfToken = null, databaseOnline = true, batchVersion = 1;
  let pendingHandovers = [], savedDraft = null, mutationBusy = false, batchDirty = false;
  const PACKAGE = 'Family food package';
  let ACTIVITY = '', BATCH_ID = '', BATCH_LABEL = '';
  const ENTITLEMENT = { rice: 6, canned: 4, beef: 4, coffee: 6, cereal: 6 };
  const GOODS = { rice: 'kg rice', canned: 'sardine cans', beef: 'corned beef cans', coffee: 'coffee sachets', cereal: 'cereal sachets' };
  const STEPS = ['verify', 'eligibility', 'release'];
  const VIEWS = { overview: 'Overview', registration: 'Registration', verification: 'Verification', beneficiaries: 'Beneficiaries', claims: 'Claim history', pending: 'Pending handovers', audit: 'Audit trail' };
  const LEGACY = { beneficiary: 'beneficiaries', 'claim-history': 'claims', eligibility: 'verification', distribution: 'verification' };
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
  const formatDate = (value) => value && !Number.isNaN(new Date(value).getTime()) ? dateFormat.format(new Date(value)) : 'Date unavailable';
  const formatTime = (value) => value && !Number.isNaN(new Date(value).getTime()) ? timeFormat.format(new Date(value)) : 'Time unavailable';
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

  const records = [], claims = [], audit = [];
  let auditSequence = 0;
  let toastTimer;
  let currentStep = 'verify';
  let entrySelected = false;
  let intake = createIntake();
  let intakeContext = "verification", registrationState = createIntake(), verificationState = intake;
  const mobileNavigation = window.matchMedia('(max-width: 1050px)');

  function createIntake() {
    return {
      path: null, recordId: null, pendingRecordId: null, verified: false, verifiedRecordId: null, method: '', manualReason: '', captureMode: 'face', consent: false,
      detailsSaved: false, profileConfirmed: false, assessment: null, readyAt: null, completed: false, receipt: null, draftSaved: false, captureComplete: false,
      capture: { face: { attempts: 0, status: 'pending' }, fingerprint: { attempts: 0, status: 'pending' } }, captureFailed: false, template: null, pendingMatch: false, manualApproval: null, duplicateReview: null, historyAccessed: false, verificationId: null, reservation: null, idempotencyKey: null, profileVersion: null, restoredDraft: null, registrationKey: crypto.randomUUID(),
      enrollment: {simulated:true, consent:false, faceCapturedAt:null, fingerprintCapturedAt:null},
      fields: { firstName: '', lastName: '', birthDate: '', sex: '', civilStatus: '', income: '', incomePeriod: 'monthly', region: '', province: '', address: '', barangay: '', city: '', householdSize: 1, contact: '', validId: '' }, members: [],
    };
  }

  function logAudit(action, details = {}, recordId = intake.recordId) {
    const mapped = /capture (failed|quality rejected)/i.test(action) ? 'Capture failure' : /confirmed beneficiary profile/i.test(action) ? 'Profile confirmed' : /rejected.*match/i.test(action) ? 'Match rejected' : /verification restarted/i.test(action) ? 'Verification restarted' : /history exported/i.test(action) ? 'Claim history exported' : /claim history directory accessed/i.test(action) ? 'Claim history viewed' : /beneficiary directory accessed/i.test(action) ? 'Beneficiary directory viewed' : /intake cleared/i.test(action) ? 'Intake cleared' : /release cancelled/i.test(action) ? 'Declined handover' : null;
    if (!mapped || !currentUser) return Promise.resolve();
    return api('/api/audit', { method: 'POST', body: { action: mapped, recordId, note: String(details.reason || details.modality || '').slice(0, 500) } }).catch(error => showToast(`Audit could not be saved: ${error.message}`));
  }

  function renderAudit() {
    text('audit-count', `${audit.length} saved events`);
    hidden('audit-empty', audit.length > 0);
    if ($('audit-list')) $('audit-list').innerHTML = audit.length ? [...audit].reverse().map((event) => `<article class="audit-event"><strong>${escapeHTML(event.action)}</strong><small>${escapeHTML(event.id)} · ${escapeHTML(event.recordId || 'Intake')} · ${escapeHTML(formatDateTime(event.at))} · ${escapeHTML(event.actor)}</small><details class="audit-detail-disclosure"><summary>Event details</summary>${auditDetails(event.details)}</details></article>`).join('') : '<p class="empty-state compact">No activity recorded in this session.</p>';
  }
  function auditDetails(value) {
    if (value === null || value === undefined || value === '') return 'None';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length ? `<ul class="audit-values">${value.map((item) => `<li>${auditDetails(item)}</li>`).join('')}</ul>` : 'None';
    if (typeof value === 'object') {
      const labels = { oldValues: 'Previous profile', newValues: 'Saved profile', recordId: 'Beneficiary record', possibleRecordId: 'Similar record', goods: 'Actual goods', actualGoods: 'Actual goods', entitlement: 'Assigned goods', references: 'Claim references', template: 'Simulated capture record', templateReference: 'Simulated capture reference', noBiometricData: 'No biometric data collected', varianceRecorded: 'Variance recorded', reviewNote: 'Staff review required', rice: 'Rice in kg', canned: 'Sardine cans', beef: 'Corned beef cans', coffee: 'Coffee sachets', cereal: 'Cereal sachets' };
      return `<dl class="audit-details">${Object.entries(value).map(([key, item]) => {
        const label = labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
        const dated = typeof item === 'string' && /(?:At|Date)$/.test(key) && !Number.isNaN(new Date(item).getTime());
        const display = dated ? escapeHTML(key.endsWith('Date') ? formatDate(item) : formatDateTime(item)) : auditDetails(item);
        return `<div><dt>${escapeHTML(label)}</dt><dd>${display}</dd></div>`;
      }).join('')}</dl>`;
    }
    return escapeHTML(value);
  }
  function registryAvailable() { return databaseOnline; }
  function batchActive() { return ($('batch-status')?.value || 'active') === 'active'; }
  function requireRegistry(errorId = 'verification-error') {
    if (registryAvailable()) return true;
    showError(errorId, 'The database is unavailable. Your entries are kept. Use Reconnect before saving or releasing.');
    return false;
  }
  function requireActiveBatch(errorId = 'verification-error') {
    if (batchActive()) return true;
    showError(errorId, 'The batch is paused or closed. An active batch is required to verify, assess, or release.');
    return false;
  }
  function goodsText(goods) { return goods ? Object.entries(GOODS).map(([key, label]) => `${goods[key] ?? '—'} ${label}`).join(' · ') : 'Goods unavailable'; }
  function readActualGoods() { return Object.fromEntries(Object.keys(ENTITLEMENT).map((key) => [key, $(`actual-${key}`) ? $(`actual-${key}`).value.trim() === '' ? NaN : Number($(`actual-${key}`).value) : ENTITLEMENT[key]])); }
  function validGoods(goods) { return Object.values(goods).every((amount) => Number.isFinite(amount) && Number.isInteger(amount) && amount >= 0) && Object.values(goods).some((amount) => amount > 0); }
  function hasVariance(goods) { return Object.keys(ENTITLEMENT).some((key) => goods[key] !== ENTITLEMENT[key]); }

  function incompleteClaim(claim) { return !claim.receipt || !claim.batchId || !claim.releasedAt || Number.isNaN(new Date(claim.releasedAt).getTime()) || !claim.goods || Object.keys(ENTITLEMENT).some((key) => !Number.isFinite(claim.goods[key]) || claim.goods[key] < 0); }

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
    if (['registration', 'verification'].includes(view) && intakeContext !== view) {
      if (mutationBusy) return showToast('Wait for the current save to finish before changing pages.');
      if (intakeContext === 'registration') { intake.fields = readFields(); registrationState = intake; }
      else verificationState = intake;
      intake = view === 'registration' ? registrationState : verificationState;
      intakeContext = view;
      if (view === 'registration') { intake.path = 'registration'; writeFields(); }
      else { writeFields(); assignField('capture-scenario', intake.recordId || intake.pendingRecordId || 'new'); renderCaptureMode(); }
    }
    document.querySelectorAll('[data-view]').forEach((panel) => { panel.hidden = panel.dataset.view !== view; });
    document.querySelectorAll('[data-view-link]').forEach((link) => {
      const selected = link.dataset.viewLink === view;
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    text('page-label', VIEWS[view]);
    if (registryAvailable() && ['beneficiaries', 'claims'].includes(view)) logAudit(view === 'claims' ? 'Claim history directory accessed' : 'Beneficiary directory accessed', { view }, null);
    closeMenu();
    const target = pageURL(view);
    if (updateHash && window.location.pathname + window.location.hash !== target) window.history.pushState(null, '', target);
    if (['registration', 'verification'].includes(view)) renderWorkflow();
    if (focus) focusHeading($(view));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function pageURL(view) { return ['registration', 'verification'].includes(view) ? `/${view}` : `/#${view}`; }
  function routeFromHash() {
    let hash;
    try { hash = decodeURIComponent(window.location.hash.slice(1)).toLowerCase(); } catch { hash = ''; }
    const pathView = window.location.pathname.replace(/^\/|\/$/g, '');
    const requested = LEGACY[hash] || hash || pathView || 'overview';
    const view = Object.hasOwn(VIEWS, requested) ? requested : 'overview';
    showView(view, {updateHash: true, focus: false});
  }

  function hasDraft() {
    return intake.verified || intake.recordId || intake.draftSaved || intake.members.length > 0 || intake.enrollment.faceCapturedAt || intake.enrollment.fingerprintCapturedAt ||
      ['firstName', 'lastName', 'birthDate', 'address'].some((key) => intake.fields[key]);
  }
  function canVisitStep(step) {
    if (!intake.path) return false;
    if (intake.reservation) return step === 'release';
    if (intake.completed) return step === 'release';
    if (step === 'verify') return true;
    if (step === 'details') return intake.verified && (intake.path === 'new' && Boolean(intake.template) || Boolean(intake.recordId));
    if (step === 'eligibility') return intake.verified && intake.detailsSaved && Boolean(intake.assessment);
    if (step === 'release') return registryAvailable() && Boolean(intake.reservation || batchActive() && intake.assessment?.eligible && intake.readyAt);
    return false;
  }
  function showStep(step, focus = true) {
    if (step === 'details') return editRegistration();
    if (intakeContext !== 'verification') showView('verification');
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
    document.body.classList.toggle('registration-first', !entrySelected);
    if (intakeContext === 'registration') {
      renderEnrollment();
      hidden('save-draft-button', false);
      hidden('registration-saved', !intake.detailsSaved || !intake.recordId);
      text('registration-saved-message', intake.recordId ? `Registration saved · ${nameOf(intake.fields)}` : '');
      text('registration-draft-status', intake.detailsSaved ? 'Registration saved' : intake.draftSaved ? 'Draft saved' : hasDraft() ? 'Unsaved changes' : '');
      text('age-preview', validBirthDate(intake.fields.birthDate) ? `${ageFromBirthDate(intake.fields.birthDate)} years old` : 'Age is calculated from the date of birth.');
      return;
    }
    hidden('registration-entry', Boolean(intake.path));
    hidden('intake-workflow', !intake.path);

    document.body.classList.toggle('registration-first', !entrySelected);
    if (intake.path && !canVisitStep(currentStep)) currentStep = intake.completed ? 'release' : 'verify';
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
    text('workflow-progress', `Step ${STEPS.indexOf(currentStep) + 1} of 3`);
    if ($('continue-details')) $('continue-details').disabled = !registryAvailable() || !batchActive() || !intake.verified || !intake.detailsSaved || !intake.profileConfirmed;
    if ($('capture-button')) $('capture-button').disabled = intake.completed || !batchActive() || intake.captureFailed || intake.capture[intake.captureMode]?.status === 'captured';
    if ($('profile-confirmed')) { $('profile-confirmed').checked = intake.profileConfirmed; $('profile-confirmed').disabled = !registryAvailable() || !intake.verified || !registeredRecord(); }
    if ($('reject-match')) $('reject-match').disabled = !intake.verified || !registeredRecord();
    const editRegistration = document.querySelector('[data-step-panel="verify"] [data-step="details"]');
    if (editRegistration) editRegistration.disabled = !canVisitStep('details');
    text('age-preview', validBirthDate(intake.fields.birthDate) ? `${ageFromBirthDate(intake.fields.birthDate)} years old` : 'Age is calculated from the date of birth.');
    renderMatchedProfile();
    hidden('match-result', (!intake.captureComplete && !intake.verified) || !registryAvailable());
    renderCaptureStatuses();
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
  function renderEnrollment() {
    const enrollment=intake.enrollment;
    $('enrollment-consent').checked=enrollment.consent;
    $('enrollment-consent').disabled=mutationBusy;
    for(const mode of ['face','fingerprint']) {
      const capturedAt=enrollment[`${mode}CapturedAt`];
      text(`enrollment-${mode}-status`, capturedAt ? `Captured · ${formatDateTime(capturedAt)}` : 'Not captured');
      text(`enroll-${mode}`, capturedAt ? `Retake ${mode}` : `Capture ${mode}`);
      $(`enroll-${mode}`).disabled=mutationBusy;
    }
    const count=Number(Boolean(enrollment.faceCapturedAt))+Number(Boolean(enrollment.fingerprintCapturedAt));
    text('enrollment-progress', `${count} of 2 captures completed`);
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
    if (intakeContext === 'registration') {
      text('registration-draft-status', intake.detailsSaved ? 'Registration saved' : intake.draftSaved ? 'Draft saved' : hasDraft() ? 'Unsaved changes' : '');
      return;
    }
    text('draft-status', intake.completed ? 'Release recorded' : intake.reservation ? 'Handover pending' : intake.draftSaved ? 'Draft saved' : intake.detailsSaved ? 'Profile saved' : hasDraft() ? 'Unsaved changes' : '');
  }
  function invalidateAssessment() {
    intake.assessment = null;
    intake.readyAt = null;
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
    text('summary-status', status === 'unverified' ? 'Capture face and fingerprint first' : status === 'draft' ? intake.detailsSaved ? 'Review profile before assessment' : 'Encode new profile' : status === 'ready' ? intake.readyAt ? 'Ready for distribution' : 'Eligible · personnel confirmation required' : statusLabel(status));
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
    list.innerHTML = memberRow(primary, 'Primary beneficiary', ageFromBirthDate(intake.fields.birthDate), null) + intake.members.map((member, index) => memberRow(member.name, `${member.relationship}${member.relatedBeneficiaryId ? " · Linked profile" : " · Declared member"}`, member.age, index)).join('');
    text('household-count', `${intake.members.length + 1} listed`);
  }
  function resetIntake(path = null) {
    intake = createIntake();
    intake.path = path;
    if (intakeContext === 'verification') currentStep = 'verify';
    if ($('identity-query')) $('identity-query').value = '';
    if ($('identity-results')) $('identity-results').innerHTML = '';
    $('manual-form')?.reset();
    if ($('receipt-print')) $('receipt-print').innerHTML = '';
    if ($('receipt-ack')) $('receipt-ack').checked = false;
    if ($('profile-confirmed')) $('profile-confirmed').checked = false;
    if ($('capture-scenario')) $('capture-scenario').value = path === 'new' ? 'new' : records[0]?.id || 'new';
    if ($('capture-quality')) $('capture-quality').value = 'clear';
    Object.entries(ENTITLEMENT).forEach(([key, value]) => assignField(`actual-${key}`, value));
    assignField('release-variance-reason', '');
    if ($('duplicate-distinct')) $('duplicate-distinct').checked = false;
    assignField('duplicate-note', '');
    hidden('duplicate-review', true);
    ['verification-error', 'form-error', 'release-error', 'enrollment-error'].forEach((id) => showError(id, ''));
    writeFields();
    renderCaptureMode();
    renderWorkflow();
  }
  function registeredRecord() {
    return records.find((record) => record.id === intake.recordId && record.registered);
  }
  function beginIntake(path) {
    entrySelected = true;
    showView('verification');
    if (intakeContext !== 'verification') return;
    resetIntake(path);
    verificationState = intake;
    focusHeading(document.querySelector(`[data-step-panel="${currentStep}"]`));
  }
  function newRegistration() {
    showView('registration');
    if (intakeContext !== 'registration') return;
    resetIntake('registration'); registrationState = intake;
    focusHeading($('registration'));
  }
  function editRegistration() {
    if (intakeContext === 'registration') return;
    const record = registeredRecord();
    if (!record || intake.reservation) return showToast('Select a saved beneficiary before editing registration.');
    const fields = {...intake.fields}, members = cloneMembers(intake.members), version = intake.profileVersion;
    showView('registration');
    if (intakeContext !== 'registration') return;
    intake = {...createIntake(), path:'registration', recordId:record.id, fields, members, profileVersion:version, detailsSaved:true, ...(record.biometricEnrollment?{enrollment:{...record.biometricEnrollment}}:{})};
    registrationState = intake; writeFields(); renderWorkflow();
  }

  function prepareReturningRecord(id) {
    const record = records.find((item) => item.id === id && item.registered);
    if (!record) return;
    beginIntake('returning');
    intake.pendingRecordId = id;
    assignField('capture-scenario', id);
    if ($('identity-query')) $('identity-query').value = id;
    renderIdentityResults([record]);
    showToast('Beneficiary selected. Complete both identity checks.');
    $('capture-consent')?.focus();
  }
  function showDuplicateError(record, message) {
    showError('form-error', message);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary small';
    button.dataset.action = 'link-existing-profile';
    button.dataset.recordId = record.id;
    button.textContent = 'Link to existing profile';
    $('form-error')?.appendChild(button);
    intake.duplicateReview = record.id;
    hidden('duplicate-review', false);
  }
  function profileChanged() {
    intake.detailsSaved = false;
    intake.profileConfirmed = false;
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
      button.disabled = intake.completed || (button.dataset.capture === 'manual' && !intake.captureFailed);
    });
    hidden('capture-panel', manual);
    hidden('manual-panel', !manual);
    hidden('manual-form', !manual);
    $('scanner')?.classList.toggle('fingerprint-mode', fingerprint);
    text('scanner-label', fingerprint ? 'Fingerprint preview' : 'Face preview');
    text('device-state', fingerprint ? 'Fingerprint capture' : 'Face capture');
    if ($('capture-button')) $('capture-button').innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-scan"></use></svg>${fingerprint ? 'Capture fingerprint' : 'Capture face'}`;
    renderCaptureStatuses();
  }
  function renderCaptureStatuses() {
    ['face', 'fingerprint'].forEach((mode) => {
      const capture = intake.capture[mode];
      text(`capture-${mode}-status`, capture.status === 'captured' ? 'Captured' : capture.status === 'failed' ? `Capture failed · ${capture.attempts} attempt${capture.attempts === 1 ? '' : 's'}` : capture.attempts ? `Unclear · retry ${capture.attempts} of 3` : 'Awaiting capture');
    });
  }
  function selectRecord(id) {
    if (!requireConsent() || !requireRegistry() || intake.completed) return;
    const record = records.find((item) => item.id === id);
    if (!record?.registered) return;
    assignField('capture-scenario', record.id);
    if ((intake.verified || intake.capture.face.attempts || intake.capture.fingerprint.attempts) && !(intake.captureFailed && !intake.verified)) restartCapture({ auditReason: 'Personnel selected a different sample scenario from search' });
    intake.pendingRecordId = record.id;
    showToast('Beneficiary selected. Complete identity verification.');
  }
  function renderIdentityResults(matches) {
    const results = $('identity-results');
    if (!results) return;
    results.innerHTML = matches.length ? matches.map((record) => `<div class="identity-result"><div><strong>${escapeHTML(nameOf(record))}</strong><small>${escapeHTML(record.id)} · registered profile</small></div><button class="button secondary" type="button" data-select-record="${escapeHTML(record.id)}">Select profile</button></div>`).join('') : '<p class="empty-state compact">No registered profile found. Register the beneficiary on the separate Registration page first.</p><button class="button secondary" type="button" data-action="new-registration">Open Registration</button>';
  }
  function loadVerifiedRecord(record, method) {
    const draft = intake.restoredDraft?.recordId === record.id ? intake.restoredDraft : null;
    intake.path = 'returning';
    intake.recordId = record.id;
    intake.pendingRecordId = null;
    intake.verified = true;
    intake.verifiedRecordId = record.id;
    intake.method = method;
    intake.profileConfirmed = false;
    intake.fields = draft ? { ...draft.fields } : Object.fromEntries(Object.keys(FIELD_IDS).map((key) => [key, record[key]]));
    intake.members = cloneMembers(draft ? draft.members : record.members);
    intake.profileVersion = draft ? draft.version : record.version;
    intake.restoredDraft = null;
    intake.detailsSaved = !draft && profileComplete(intake.fields, intake.members);
    intake.historyAccessed = true;
    record.verified = true;
    invalidateAssessment();
    logAudit('Profile accessed after verification', { method }, record.id);
    const history = claims.filter((claim) => claim.recordId === record.id);
    logAudit('Individual claim history retrieved', { references: history.map((claim) => claim.receipt || 'Missing reference'), incomplete: history.some(incompleteClaim) }, record.id);
    if (history.some(incompleteClaim)) logAudit('Incomplete claim flagged for staff review', { references: history.filter(incompleteClaim).map((claim) => claim.receipt || 'Missing reference') }, record.id);
    writeFields();
    renderWorkflow();
  }
  async function resolveCapturedMatch() {
    if (!intake.pendingMatch || !requireRegistry() || !requireActiveBatch()) return;
    const scenario = $('capture-scenario')?.value || 'new';
    const record = records.find(item => item.id === scenario);
    if (!record) { intake.pendingMatch = false; newRegistration(); showToast('No registered beneficiary selected. Save the profile on Registration, then open Verification.'); return; }
    mutationBusy = true;
    try {
      const verification = await api('/api/verification', { method: 'POST', body: { method: 'simulated', recordId: record?.id || null, face: true, fingerprint: true, consent: intake.consent } });
      intake.verificationId = verification.id; intake.pendingMatch = false;
      if (record) {
        const fresh = await api(`/api/beneficiaries/${encodeURIComponent(record.id)}`);
        records.splice(records.findIndex(p => p.id === record.id), 1, fresh.record);
        claims.splice(0, claims.length, ...claims.filter(c => c.recordId !== record.id), ...fresh.claims);
        loadVerifiedRecord(fresh.record, 'Face + fingerprint (demo)');
        text('capture-result-status', `Review the profile and claim history for ${nameOf(record)}.`);
      } else {
        intake.path = 'new'; intake.recordId = null; intake.verified = true; intake.verifiedRecordId = null;
        intake.method = 'Simulated face + fingerprint · Not Found'; intake.detailsSaved = false;
        invalidateAssessment(); writeFields(); showStep('details');
        showToast('No matching profile. Register the beneficiary first.');
      }
    } catch (error) { intake.pendingMatch = true; showError('verification-error', error.message); }
    finally { mutationBusy = false; }
  }

  function restartCapture({ auditReason = '', preserveFields = false } = {}) {
    if (auditReason) logAudit('Verification restarted', { reason: auditReason });
    const fields = intake.fields;
    const members = intake.members;
    const consent = intake.consent;
    const scenario = $('capture-scenario')?.value;
    intake = createIntake();
    intake.path = scenario === 'new' ? 'new' : 'counter';
    intake.consent = consent;
    if (preserveFields) { intake.fields = fields; intake.members = members; }
    currentStep = 'verify';
    writeFields();
    renderCaptureMode();
    renderWorkflow();
  }
  function renderMatchedProfile() {
    const record = registryAvailable() && intake.verified ? registeredRecord() : null;
    hidden('matched-profile', !record);
    hidden('claim-history-preview', !record);
    hidden('registration-status', !intake.detailsSaved || !record);
    text('registration-status', record ? `Verified profile · ${record.id}. ${intake.profileConfirmed ? 'Profile confirmed; continue to assessment.' : 'Personnel must confirm the profile before assessment.'}` : 'Complete face and fingerprint capture first.');
    if (!record) return;
    const age = ageFromBirthDate(record.birthDate);
    if ($('matched-profile')) $('matched-profile').innerHTML = `<h3>${escapeHTML(nameOf(record))}</h3><dl class="record-facts"><div><dt>Registered profile</dt><dd>${escapeHTML(record.id)}</dd></div><div><dt>Age / date of birth</dt><dd>${age} years · ${escapeHTML(record.birthDate)}</dd></div><div><dt>Location</dt><dd>${escapeHTML(record.address)}, ${escapeHTML(record.barangay)}, ${escapeHTML(record.city)}, ${escapeHTML(record.province)}, ${escapeHTML(record.region)}</dd></div><div><dt>Sex / gender · civil status</dt><dd>${escapeHTML(record.sex)} · ${escapeHTML(record.civilStatus)}</dd></div><div><dt>Household</dt><dd>${record.householdSize} people · ₱${Number(record.income).toLocaleString('en-PH')} ${escapeHTML(record.incomePeriod)}</dd></div><div><dt>Contact</dt><dd>${escapeHTML(record.contact)}</dd></div><div><dt>Family members and relations</dt><dd>${record.members.length ? record.members.map((member) => `${escapeHTML(member.name)} · ${escapeHTML(member.relationship)}${member.age === null ? '' : ` · ${escapeHTML(member.age)} years`}`).join('<br>') : 'No linked family members'}</dd></div></dl>`;
    const history = claims.filter((claim) => claim.recordId === record.id).sort((a, b) => new Date(b.releasedAt) - new Date(a.releasedAt));
    if ($('claim-history-preview')) $('claim-history-preview').innerHTML = `<h3>Individual claim history</h3><p class="field-hint">Active batch: ${escapeHTML(BATCH_LABEL)}. Only this individual’s claims are checked.</p>${history.length ? `<ul class="claim-history-list">${history.map(claimHistoryRow).join('')}</ul>` : '<p class="empty-state compact">No Previous Claims for this beneficiary.</p>'}`;
  }
  function claimHistoryRow(claim) {
    return `<li><strong>${escapeHTML(claim.receipt || 'Reference unavailable')}</strong><span class="badge" data-tone="${claim.batchId === BATCH_ID || incompleteClaim(claim) ? 'warning' : 'neutral'}">${incompleteClaim(claim) ? 'Incomplete record · staff review' : claim.batchId === BATCH_ID ? 'Current batch · already claimed' : 'Previous batch'}</span><small>${escapeHTML(claim.batchLabel || claim.batchId || 'Batch unavailable')} · ${escapeHTML(formatDateTime(claim.releasedAt))}</small><small>${escapeHTML(goodsText(claim.goods))} · ${escapeHTML(claim.personnelName || 'Personnel unavailable')}</small>${claim.varianceReason ? `<small>Variance: ${escapeHTML(claim.varianceReason)} · Staff review flagged</small>` : ''}</li>`;
  }
  function hasBeneficiaryClaim(record, id = record.id) { return claims.some((claim) => claim.batchId === BATCH_ID && claim.recordId === id); }
  function currentClaims() { return claims.filter((claim) => claim.batchId === BATCH_ID); }

  function validBirthDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > TODAY) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  function profileComplete(fields, members = []) {
    return ['firstName', 'lastName', 'sex', 'civilStatus', 'region', 'province', 'address', 'barangay', 'city', 'contact'].every((key) => Boolean(String(fields[key] ?? '').trim())) && String(fields.income ?? '').trim() !== '' && Number.isFinite(Number(fields.income)) && Number(fields.income) >= 0 && ['monthly', 'annual'].includes(fields.incomePeriod) && validBirthDate(fields.birthDate) && Number.isInteger(fields.householdSize) && fields.householdSize >= members.length + 1 && fields.householdSize >= 1 && fields.householdSize <= 20;
  }
  async function performAssessment() {
    if (!requireRegistry() || !requireActiveBatch() || mutationBusy) return false;
    if (!registeredRecord() || !intake.detailsSaved || !intake.profileConfirmed) { showError('verification-error', 'Save and confirm this beneficiary profile first.'); return false; }
    mutationBusy = true;
    try {
      intake.assessment = await api('/api/assessments', { method: 'POST', body: { recordId: intake.recordId, verificationId: intake.verificationId, profileConfirmed: true } });
      intake.readyAt = null; await refreshWorkspace(); showStep('eligibility'); return true;
    } catch (error) { showError('verification-error', error.message); return false; }
    finally { mutationBusy = false; }
  }

  function renderEligibility() {
    const result = intake.assessment;
    if ($('eligibility-banner')) $('eligibility-banner').dataset.tone = result ? result.eligible ? 'success' : result.status === 'released' ? 'danger' : 'warning' : 'neutral';
    text('eligibility-title', !result ? 'Assessment pending' : result.eligible ? intake.readyAt ? 'Ready for distribution' : 'Eligible · personnel confirmation required' : result.status === 'released' ? 'Already Claimed · Not Eligible' : 'Not Eligible · station review required');
    text('eligibility-description', !result ? 'Verify and confirm the profile before assessment.' : result.eligible ? intake.readyAt ? `Eligibility confirmed · ${formatDateTime(intake.readyAt)}` : 'All checks passed. Confirm eligibility to prepare the handover.' : result.status === 'released' ? 'This beneficiary has already received goods in this batch.' : 'Review the failed checks before proceeding.');
    if ($('rule-list')) $('rule-list').innerHTML = result ? result.rules.map((rule) => `<div class="rule-row"><span class="rule-icon" data-tone="${rule.passed ? 'success' : 'warning'}" aria-hidden="true">${rule.passed ? '✓' : '!'}</span><div><strong>${escapeHTML(rule.title)}</strong><small>${escapeHTML(rule.description)}</small></div><span class="badge" data-tone="${rule.passed ? 'success' : 'warning'}">${rule.passed ? 'Passed' : 'Review'}</span></div>`).join('') : '';
    if ($('release-button')) $('release-button').disabled = !result?.eligible || intake.completed || !registryAvailable() || !batchActive();
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
    const goods = readActualGoods();
    const prepared = Boolean(intake.reservation);
    const variance = hasVariance(goods);
    hidden('release-variance-notice', !variance);
    text('release-variance-notice', 'Actual items differ from the entitlement. A reason is required; the reason is saved with the transaction.');
    if (!intake.completed) {
      const releaseProblem = !registryAvailable() ? 'Registry unavailable. The release is paused; restore the registry and retry eligibility.' : !batchActive() && !prepared ? 'The batch is paused or closed. No new handover may be prepared.' : !validGoods(goods) ? 'Enter finite, nonnegative whole quantities for every item, with at least one item released.' : variance && !$('release-variance-reason')?.value.trim() ? 'Enter a reason for the difference from the assigned entitlement.' : '';
      if (releaseProblem && !prepared) showError('release-error', releaseProblem);
    }
    if ($('confirm-release')) $('confirm-release').disabled = mutationBusy || intake.completed || !registryAvailable() || !prepared || !$('receipt-ack')?.checked;
    if ($('reserve-release')) { $('reserve-release').hidden = prepared; $('reserve-release').disabled = mutationBusy || !registryAvailable() || !batchActive() || !intake.readyAt || !validGoods(goods) || variance && !$('release-variance-reason')?.value.trim(); }
    if ($('receipt-ack')) $('receipt-ack').disabled = !prepared;
    Object.keys(ENTITLEMENT).forEach(key => { if ($(`actual-${key}`)) $(`actual-${key}`).disabled = prepared; });
    if ($('release-variance-reason')) $('release-variance-reason').disabled = prepared;
    hidden('handover-prepared', !prepared);
    text('handover-prepared', prepared ? `Handover ${intake.reservation.id} is saved as pending. Hand over the goods, then confirm receipt. If saving fails, keep this reference and retry; do not hand over a second package.` : '');
    if (intake.receipt) {
      text('receipt-number', intake.receipt.receipt);
      text('receipt-beneficiary', intake.receipt.beneficiary);
      text('receipt-time', formatDateTime(intake.receipt.releasedAt));
      text('receipt-personnel', `${intake.receipt.personnelName} · ${intake.receipt.personnelId}`);
      text('receipt-batch', intake.receipt.batchLabel);
      text('receipt-goods', goodsText(intake.receipt.goods));
      renderPrintableReceipt(intake.receipt);
    }
  }
  function renderPrintableReceipt(receipt) {
    if (!$('receipt-print')) return;
    $('receipt-print').innerHTML = `<div class="receipt-print-inner"><div class="receipt-branding"><img class="receipt-dswd-logo" src="assets/branding/dswd-logo.png" alt="Department of Social Welfare and Development" width="939" height="265" /><img class="receipt-bagong-logo" src="assets/branding/bagong-pilipinas-logo.png" alt="Bagong Pilipinas" width="692" height="648" /></div><p>DSWD relief distribution · release receipt</p><h1>Relief distribution acknowledgment</h1><p>Saved distribution transaction.</p><dl><dt>Receipt</dt><dd>${escapeHTML(receipt.receipt)}</dd><dt>Beneficiary</dt><dd>${escapeHTML(receipt.beneficiary)}</dd><dt>Beneficiary record ID</dt><dd>${escapeHTML(receipt.recordId)}</dd><dt>Activity / batch</dt><dd>${escapeHTML(receipt.activity)} · ${escapeHTML(receipt.batchLabel)}</dd><dt>Actual goods released</dt><dd>${escapeHTML(goodsText(receipt.goods))}</dd><dt>Variance reason</dt><dd>${escapeHTML(receipt.varianceReason || 'Entitlement released in full')}</dd><dt>Released</dt><dd>${escapeHTML(formatDateTime(receipt.releasedAt))}</dd><dt>Personnel in charge</dt><dd>${escapeHTML(receipt.personnelName)} · ${escapeHTML(receipt.personnelId)}</dd></dl><p>Receipt acknowledgment recorded by the signed-in staff member.</p></div>`;
  }
  function synchronizeStatuses() {
    records.forEach((record) => { record.status = hasBeneficiaryClaim(record) ? 'released' : !record.verified ? 'registered' : profileComplete(record, record.members) ? 'ready' : 'review'; });
  }
  function tableName(record) { return `<strong>${escapeHTML(nameOf(record))}</strong><small>${escapeHTML(record.id)} · registered record</small>`; }
  function openButton(record) { return `<button class="table-action" type="button" data-open-record="${escapeHTML(record.id)}" aria-label="View ${escapeHTML(nameOf(record))}">View <span aria-hidden="true">↗</span></button>`; }
  function renderDashboard() {
    document.querySelectorAll('[data-activity-label]').forEach(element => { element.textContent = ACTIVITY || 'Distribution'; });
    document.querySelectorAll('[data-batch-label]').forEach(element => { element.textContent = BATCH_LABEL || '—'; });
    Object.entries(ENTITLEMENT).forEach(([key,quantity]) => text(`entitlement-${key}`, `${quantity}`));
    const batchState = $('batch-status')?.value || 'active';
    text('sidebar-batch-status', `${batchState[0].toUpperCase()}${batchState.slice(1)} batch`);
    text('hero-batch-status', `${batchState[0].toUpperCase()}${batchState.slice(1)} batch`);
    const batchClaims = currentClaims();
    const released = batchClaims.reduce((total, claim) => total + claim.quantity, 0);
    text('stat-households', records.length);
    text('stat-released', released);
    text('stat-ready', records.filter((record) => record.status === 'ready').length);
    text('stat-review', records.filter((record) => ['registered', 'review'].includes(record.status)).length);
    text('hero-progress-label', `${released} confirmed handovers in this batch`);
    const recent = registryAvailable() ? [...records].sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity)).slice(0, 5) : [];
    if ($('recent-beneficiaries')) $('recent-beneficiaries').innerHTML = recent.map((record) => `<tr><td>${tableName(record)}</td><td>${escapeHTML(record.barangay)}</td><td>${record.householdSize}</td><td>${badge(record.status)}</td><td>${openButton(record)}</td></tr>`).join('');
    text('recent-count', `${recent.length} recent beneficiaries`);
    const latest = registryAvailable() ? [...batchClaims].sort((a, b) => new Date(b.releasedAt) - new Date(a.releasedAt)).slice(0, 3) : [];
    if ($('activity-feed')) $('activity-feed').innerHTML = latest.map((claim) => `<li><span class="activity-mark"><svg class="icon" aria-hidden="true"><use href="#i-package"></use></svg></span><div><strong>Package released to ${escapeHTML(claim.beneficiary)}</strong><small>${escapeHTML(claim.receipt)} · ${escapeHTML(claim.recordId)}</small></div><time datetime="${escapeHTML(claim.releasedAt)}">${escapeHTML(formatTime(claim.releasedAt))}</time></li>`).join('');
    const hourFormatter = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: '2-digit', hourCycle: 'h23' });
    const hours = new Set(Array.from({ length: 8 }, (_, index) => index + 8));
    const datedClaims = batchClaims.filter((claim) => claim.releasedAt && !Number.isNaN(new Date(claim.releasedAt).getTime()));
    datedClaims.forEach((claim) => hours.add(Number(hourFormatter.format(new Date(claim.releasedAt)))));
    const hourly = [...hours].sort((a, b) => a - b).map((hour) => ({ hour, count: 0 }));
    datedClaims.forEach((claim) => { const bucket = hourly.find((item) => item.hour === Number(hourFormatter.format(new Date(claim.releasedAt)))); if (bucket) bucket.count += claim.quantity; });
    const max = Math.max(4, Math.ceil(Math.max(...hourly.map((item) => item.count)) / 4) * 4);
    const axis = document.querySelector('.chart-axis');
    if (axis) axis.innerHTML = Array.from({ length: 5 }, (_, index) => `<span>${max - index * max / 4}</span>`).join('');
    if ($('hourly-chart')) $('hourly-chart').innerHTML = hourly.map((item) => `<div class="chart-column" aria-label="${String(item.hour).padStart(2, '0')}:00: ${item.count} packages"><div class="chart-bar${item.count ? '' : ' empty'}" style="--bar-height: ${item.count / max * 100}%" title="${item.count} packages"></div><span>${String(item.hour).padStart(2, '0')}</span></div>`).join('');
    if ($('hourly-chart')) $('hourly-chart').setAttribute('aria-label', `Packages released by hour in the current batch: ${hourly.map((item) => `${String(item.hour).padStart(2, '0')}:00, ${item.count}`).join('; ')}.`);
    if ($('chart-total')) $('chart-total').innerHTML = `${released} <span>packages released</span>`;
  }
  function renderDirectory() {
    if (!registryAvailable()) {
      if ($('beneficiaries-table')) $('beneficiaries-table').innerHTML = '<tr><td colspan="6" class="empty-state">Registry unavailable. Restore the registry to view beneficiary profiles.</td></tr>';
      text('beneficiary-count', 'Registry unavailable');
      return;
    }
    const query = normalize($('beneficiary-search')?.value);
    const filter = $('beneficiary-status')?.value || 'all';
    const matches = [...records].filter((record) => (!query || normalize(`${nameOf(record)} ${record.id} ${record.barangay}`).includes(query)) && (filter === 'all' || record.status === filter)).sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
    if ($('beneficiaries-table')) $('beneficiaries-table').innerHTML = matches.length ? matches.map((record) => `<tr><td>${tableName(record)}</td><td>${escapeHTML(record.barangay)}<small>${escapeHTML(record.city)}</small></td><td>${record.householdSize} ${record.householdSize === 1 ? 'person' : 'people'}</td><td>${badge(record.status)}</td><td>${escapeHTML(formatDateTime(record.lastActivity))}</td><td>${openButton(record)}</td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No beneficiaries match these filters. Try another name or status.</td></tr>';
    text('beneficiary-count', `${matches.length} of ${records.length} beneficiaries`);
  }
  function renderClaims() {
    if (!registryAvailable()) {
      if ($('claims-table')) $('claims-table').innerHTML = '<tr><td colspan="7" class="empty-state">Registry unavailable. Claim history cannot be retrieved until the connection is restored.</td></tr>';
      text('claims-count', 'Registry unavailable');
      return;
    }
    const query = normalize($('claims-search')?.value);
    const matches = [...claims].filter((claim) => !query || normalize(`${claim.receipt} ${claim.beneficiary} ${claim.recordId} ${claim.batchLabel} ${claim.personnelName} ${claim.personnelId}`).includes(query)).sort((a, b) => new Date(b.releasedAt) - new Date(a.releasedAt));
    if ($('claims-table')) $('claims-table').innerHTML = matches.length ? matches.map((claim) => `<tr><td><strong class="record-id">${escapeHTML(claim.receipt || 'Reference unavailable')}</strong><button class="table-action" type="button" data-saved-receipt="${escapeHTML(claim.receipt)}">Print receipt</button></td><td><strong>${escapeHTML(claim.beneficiary)}</strong><small>${escapeHTML(claim.recordId)} · registered record</small></td><td>${escapeHTML(goodsText(claim.goods))}${claim.varianceReason ? `<small>Variance: ${escapeHTML(claim.varianceReason)} · Staff review flagged</small>` : ''}</td><td>${escapeHTML(formatDate(claim.releasedAt))}<small>${escapeHTML(formatTime(claim.releasedAt))} PHT</small></td><td>${escapeHTML(claim.personnelName || 'Personnel unavailable')}<small>${escapeHTML(claim.personnelId)}</small></td><td>${escapeHTML(claim.batchLabel || claim.batchId || 'Batch unavailable')}<small>${claim.batchId === BATCH_ID ? 'Current batch' : claim.batchId ? 'Previous batch' : 'Unknown batch'}</small></td><td><span class="badge" data-tone="${incompleteClaim(claim) ? 'warning' : 'success'}">${incompleteClaim(claim) ? 'Incomplete · review' : 'Recorded'}</span></td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">No claims match your search.</td></tr>';
    text('claims-count', `${matches.length} ${matches.length === 1 ? 'claim' : 'claims'}${query ? ` of ${claims.length}` : ' recorded'}`);
  }

  function renderAll() {
    populateCaptureScenarios();
    synchronizeStatuses();
    renderDashboard();
    renderDirectory();
    renderClaims();
    renderPending();
    renderHousehold();
    renderWorkflow();
    renderAudit();
  }
  function openDialog(id) {
    const dialog = $(id);
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  function closeDialog(dialog) { if (!dialog) return; if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
  async function openRecord(id) {
    if (!requireRegistry()) return showToast('Registry unavailable. Restore it before viewing a profile or history.');
    let record;
    try { const fresh = await api(`/api/beneficiaries/${encodeURIComponent(id)}`); record = fresh.record; claims.splice(0, claims.length, ...claims.filter(c => c.recordId !== id), ...fresh.claims); } catch (error) { showToast(error.message); return; }
    text('record-dialog-title', nameOf(record));
    const history = claims.filter((claim) => claim.recordId === id);
    logAudit('Profile viewed from beneficiary directory', {}, id);
    logAudit('Individual claim history accessed', { references: history.map((claim) => claim.receipt || 'Missing reference'), incomplete: history.some(incompleteClaim) }, id);
    if ($('record-dialog-content')) $('record-dialog-content').innerHTML = `<div class="record-dialog-summary">${badge(record.status)}<span class="record-id">${escapeHTML(record.id)} · registered profile</span></div><dl class="record-facts"><div><dt>Location</dt><dd>${escapeHTML(record.barangay)}, ${escapeHTML(record.city)}, ${escapeHTML(record.province)}, ${escapeHTML(record.region)}</dd></div><div><dt>Household</dt><dd>${record.householdSize} ${record.householdSize === 1 ? 'person' : 'people'}</dd></div><div><dt>Last activity</dt><dd>${escapeHTML(formatDateTime(record.lastActivity))}</dd></div></dl><h3>Individual claim history</h3>${history.length ? `<ul class="record-claims">${history.map(claimHistoryRow).join('')}</ul>` : '<p class="empty-state compact">No Previous Claims for this beneficiary.</p>'}`;
    if ($('record-continue')) {
      $('record-continue').dataset.recordId = id;
      $('record-continue').textContent = record.status === 'released' ? 'Verify and review record' : 'Continue to verification';
    }
    openDialog('record-dialog');
  }
  function exportClaims() {
    if (!requireRegistry()) return showToast('Registry unavailable. Restore it before exporting claim history.');
    const safeCSV = (value) => { let cell = String(value ?? ''); if (/^[\s]*[=+\-@\t\r]/.test(cell)) cell = `'${cell}`; return `"${cell.replace(/"/g, '""')}"`; };
    const rows = [['Receipt', 'Beneficiary record ID', 'Activity', 'Batch ID', 'Batch', 'Package', 'Quantity', ...Object.values(GOODS), 'Variance reason', 'Variance recorded', 'Eligibility confirmed at (ISO)', 'Released at (ISO)', 'Personnel in charge', 'Personnel ID', 'Status'], ...claims.map((claim) => [claim.receipt, claim.recordId, claim.activity, claim.batchId, claim.batchLabel, claim.package, claim.quantity, ...Object.keys(GOODS).map((key) => claim.goods?.[key]), claim.varianceReason, claim.varianceReason ? 'Yes' : 'No', claim.eligibilityConfirmedAt, claim.releasedAt, claim.personnelName, claim.personnelId, claim.status])];
    const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(safeCSV).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dswd-claims-${TODAY}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${claims.length} claims. The CSV excludes beneficiary names and addresses.`);
    logAudit('Claim history exported', { count: claims.length }, null);
  }
  const actions = {
    'start-distribution': () => beginIntake('counter'),
    'new-registration': newRegistration,
    'restart-verification': () => beginIntake('counter'),
    'verify-registration': () => { if (intake.detailsSaved && intake.recordId) prepareReturningRecord(intake.recordId); },
    'returning-beneficiary': () => beginIntake('returning'),
    'review-existing': (button) => prepareReturningRecord(button.dataset.recordId),
    'link-existing-profile': async (button) => {
      try {
        const fresh = await api(`/api/beneficiaries/${encodeURIComponent(button.dataset.recordId)}`);
        intake = {...createIntake(), path:'registration', recordId:fresh.record.id, profileVersion:fresh.record.version, fields:Object.fromEntries(Object.keys(FIELD_IDS).map(key=>[key,fresh.record[key]])), members:cloneMembers(fresh.record.members), detailsSaved:true};
        if(fresh.record.biometricEnrollment) intake.enrollment={...fresh.record.biometricEnrollment};
        registrationState = intake; writeFields(); showError('form-error', ''); hidden('duplicate-review', true); renderWorkflow();
        showToast('Existing registration opened. Verify this beneficiary before distribution.');
      } catch (error) { showError('form-error', error.message); }
    },

    'retry-capture': () => { if (intake.completed) return; restartCapture({ auditReason: 'Personnel retried simulated capture', preserveFields: true }); showToast('Capture restarted. Both modalities are required again.'); },
    'start-registration': () => {
      showView('verification');
      if (intakeContext !== 'verification') return;
      if (intake.completed) beginIntake('counter');
      focusHeading($('verification'));
    },

    'save-draft': async () => {
      if (!intake.path || intake.completed) return;
      intake.fields = readFields();
      try { await api('/api/draft', { method: 'PUT', body: { fields: intake.fields, members: intake.members, enrollment:intake.enrollment, recordId: intake.recordId, version: intake.profileVersion, registrationKey: intake.registrationKey } }); intake.draftSaved = true; updateDraftStatus(); showToast('Draft saved.'); } catch (error) { showToast(error.message); }
    },

    'add-member': () => { if (intake.completed || intake.reservation) return; $('member-form')?.reset(); populateFamilyOptions(); openDialog('member-dialog'); },
    'cancel-intake': () => {
      if (hasDraft()) logAudit('Intake cleared without claim', {reason:'Staff cleared the current page'});
      if (intakeContext === 'registration') { resetIntake('registration'); registrationState = intake; }
      else { resetIntake(); verificationState = intake; }
      showToast('Current page cleared. Saved registrations and pending handovers remain available.');
    },

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
      if (button.dataset.capture === 'manual' && !intake.captureFailed) return showToast('Manual verification requires a recorded biometric capture failure first.');
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
      restartCapture({ auditReason: 'Privacy acknowledgment withdrawn', preserveFields: true });
    } else showError('verification-error', '');
  });
  listen('identity-search-form', 'submit', (event) => {
    event.preventDefault();
    if (!requireConsent() || !requireRegistry()) return;
    const query = normalize($('identity-query')?.value);
    if (!query) { showError('verification-error', 'Enter a beneficiary name or ID to search.'); $('identity-query')?.focus(); return; }
    renderIdentityResults(records.filter((record) => normalize(nameOf(record)).includes(query) || normalize(record.id).includes(query) || record.members.some((member) => normalize(member.name).includes(query))));
    logAudit('Sample scenario search', { query }, null);
  });
  listen('capture-button', 'click', () => {
    if (!requireConsent() || !requireActiveBatch() || intake.completed || intake.captureFailed) return;
    const mode = intake.captureMode;
    if (!['face', 'fingerprint'].includes(mode) || intake.capture[mode].status === 'captured') return;
    const quality = $('capture-quality')?.value || 'clear';
    const capture = intake.capture[mode];
    capture.attempts += 1;
    if (quality !== 'clear') {
      capture.status = quality === 'device-error' || capture.attempts >= 3 ? 'failed' : 'unclear';
      intake.captureFailed = capture.status === 'failed';
      logAudit(intake.captureFailed ? 'Simulated capture failed' : 'Simulated capture quality rejected', { modality: mode, quality, attempt: capture.attempts, manualFallbackAvailable: intake.captureFailed }, null);
      showError('verification-error', quality === 'device-error' ? 'Device unavailable. Retry capture or use valid-ID verification for an existing beneficiary.' : intake.captureFailed ? 'Capture failed after three attempts. Retry both captures or use valid-ID verification for an existing beneficiary.' : `Unclear ${mode} capture. ${3 - capture.attempts} attempt${3 - capture.attempts === 1 ? '' : 's'} remaining.`);
      renderCaptureMode(); renderWorkflow();
      return;
    }
    capture.status = 'captured';
    capture.capturedAt = new Date().toISOString();
    logAudit('Simulated capture accepted', { modality: mode, attempt: capture.attempts, simulated: true, noBiometricData: true }, null);
    if (intake.capture.face.status === 'captured' && intake.capture.fingerprint.status === 'captured') {
      intake.captureComplete = true;
      intake.template = { simulated: true, face: true, fingerprint: true, reference: `DEMO-T-${Date.now()}-${auditSequence}`, capturedAt: new Date().toISOString() };
      intake.pendingMatch = true;
      resolveCapturedMatch();
    } else {
      intake.captureMode = mode === 'face' ? 'fingerprint' : 'face';
      showToast('Capture the other identity check to continue.');
    }
    renderCaptureMode(); renderWorkflow();
  });
  listen('continue-details', 'click', () => {
    performAssessment();
  });
  if ($('manual-form')) $('manual-form').noValidate = true;
  listen('manual-form', 'submit', async (event) => {
    event.preventDefault();
    if (!requireConsent() || !requireRegistry() || !requireActiveBatch()) return;
    if (!intake.captureFailed) { showError('verification-error', 'Manual verification is available only after a recorded capture failure.'); return; }
    const reference = $('manual-reference')?.value.trim() || '';
    const reason = $('manual-reason')?.value.trim() || '';
    if (!reference || !reason) { showError('verification-error', 'Provide a valid-ID reference and verification reason.'); return; }
    const selectedId = $('capture-scenario')?.value || intake.pendingRecordId;
    const record = records.find((item) => item.id === selectedId && item.registered);
    if (!record) { showError('verification-error', 'Select a registered beneficiary for valid-ID verification.'); return; }
    try { const verification = await api('/api/verification', { method: 'POST', body: { method: 'manual', recordId: record.id, consent: intake.consent, reference, reason } }); intake.verificationId = verification.id; } catch (error) { showError('verification-error', error.message); return; }
    intake.manualApproval = { reference, reason, verifiedBy: currentUser.id, verifiedAt: new Date().toISOString() };
    intake.manualReason = reason;
    loadVerifiedRecord(record, `Manual verification · ${reference}`);
    logAudit('Manual verification approved after capture failure', intake.manualApproval, record.id);
    text('capture-result-status', `Manual verification recorded for ${record.id}. Review the existing profile and individual claim history before confirmation.`);
    renderWorkflow(); showToast('Valid-ID verification saved in the audit trail. Review and confirm the existing profile.');
  });
  if ($('birth-date')) $('birth-date').max = TODAY;
  listen('enrollment-consent','input',()=>{
    if(intakeContext!=='registration' || mutationBusy) return;
    intake.enrollment.consent=$('enrollment-consent').checked;
    if(!intake.enrollment.consent) { intake.enrollment.faceCapturedAt=null; intake.enrollment.fingerprintCapturedAt=null; }
    profileChanged(); renderEnrollment();
  });
  for(const mode of ['face','fingerprint']) listen(`enroll-${mode}`,'click',()=>{
    if(intakeContext!=='registration' || mutationBusy) return;
    if(!intake.enrollment.consent) { showError('enrollment-error','Acknowledge the enrollment privacy notice before capture.'); $('enrollment-consent').focus(); return; }
    intake.enrollment[`${mode}CapturedAt`]=new Date().toISOString();
    profileChanged(); showError('enrollment-error',''); renderEnrollment();
    showToast(`${mode === 'face' ? 'Face' : 'Fingerprint'} captured.`);
  });
  if ($('beneficiary-form')) $('beneficiary-form').noValidate = true;
  const handleDetailsEdit = () => { if (intake.completed) return; intake.fields = readFields(); profileChanged(); };
  listen('beneficiary-form', 'input', handleDetailsEdit);
  listen('beneficiary-form', 'change', handleDetailsEdit);
  listen('beneficiary-form', 'submit', async (event) => {
    event.preventDefault();
    if (intake.completed) return;
    if (!intake.path) return;
    const fields = readFields();
    intake.fields = fields;
    if (intakeContext !== 'registration' || !requireRegistry('form-error')) return;
    const required = [['firstName', 'First and middle names'], ['lastName', 'Last name'], ['birthDate', 'Date of birth'], ['sex', 'Sex / gender'], ['civilStatus', 'Civil status'], ['region', 'Region'], ['province', 'Province'], ['address', 'Street / sitio'], ['barangay', 'Barangay'], ['city', 'City / municipality'], ['income', 'Household income'], ['incomePeriod', 'Income period'], ['contact', 'Contact information']];
    const missing = required.find(([key]) => !fields[key]);
    if (missing) { showError('form-error', `${missing[1]} is required. Complete the household profile to continue.`); $(FIELD_IDS[missing[0]])?.focus(); return; }
    if(!intake.enrollment.consent || !intake.enrollment.faceCapturedAt || !intake.enrollment.fingerprintCapturedAt) {
      showError('enrollment-error','Acknowledge the privacy notice and capture both face and fingerprint before saving registration.'); $('enrollment-consent').focus(); return;
    }
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
    const validIdDuplicate = fields.validId ? records.find((record) => record.id !== intake.recordId && record.validId && normalize(record.validId) === normalize(fields.validId)) : null;
    const duplicate = personDuplicate || validIdDuplicate;
    if (duplicate) {
      if (intake.duplicateReview !== duplicate.id) {
        if ($('duplicate-distinct')) $('duplicate-distinct').checked = false;
        assignField('duplicate-note', '');
      }
      const distinct = $('duplicate-distinct')?.checked;
      const note = $('duplicate-note')?.value.trim() || '';
      if (!distinct || !note || intake.duplicateReview !== duplicate.id) {
        showDuplicateError(duplicate, `${personDuplicate ? 'Name and date of birth match' : 'Valid ID matches'} profile ${duplicate.id}. Link to the existing individual, or confirm a different person and provide a staff review note.`); return;
      }
      logAudit('Possible duplicate confirmed as different person', { possibleRecordId: duplicate.id, note, reviewNote: true }, intake.recordId);
    }
    showError('form-error', '');
    hidden('duplicate-review', true);
    const isNew = !intake.recordId;
    const submit = $('beneficiary-form').querySelector('[type="submit"]');
    submit.disabled = true; mutationBusy = true;
    try {
      const saved = await api(intake.recordId ? `/api/beneficiaries/${encodeURIComponent(intake.recordId)}` : '/api/beneficiaries', { method: intake.recordId ? 'PUT' : 'POST', body: { profile: fields, enrollment:intake.enrollment, members: intake.members, version: intake.profileVersion, registrationKey: intake.registrationKey, duplicateId: intake.duplicateReview, duplicateNote: $('duplicate-note')?.value.trim() || '' } });
      intake.recordId = saved.id; intake.profileVersion = saved.version;
      intake.detailsSaved = true; intake.draftSaved = false; intake.assessment = null; intake.readyAt = null; intake.profileConfirmed = false;
      await refreshWorkspace();
      if (verificationState.recordId === saved.id && !verificationState.reservation) verificationState = createIntake();
      renderWorkflow(); showToast(isNew ? 'Registration saved.' : 'Registration updated. Verify again before distribution.');
    } catch (error) {
      intake.detailsSaved = false;
      if (error.duplicateId) { const candidate = records.find(p => p.id === error.duplicateId); if (candidate) showDuplicateError(candidate, error.message); else showError('form-error', error.message); }
      else showError('form-error', error.message);
    } finally { submit.disabled = false; mutationBusy = false; renderEnrollment(); }
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
    const relatedBeneficiaryId = $('member-existing')?.value || null;
    if (relatedBeneficiaryId && !$('member-confirm-link')?.checked) return showToast('Confirm that the selected registered profile is the correct family member.');
    if (relatedBeneficiaryId && intake.members.some(m => m.relatedBeneficiaryId === relatedBeneficiaryId)) return showToast('This person is already linked.');
    intake.members.push({ name, relationship, age, relatedBeneficiaryId });

    intake.fields.householdSize = Math.max(intake.members.length + 1, Number(intake.fields.householdSize) || 1);
    assignField('household-size', intake.fields.householdSize);
    closeDialog($('member-dialog')); profileChanged();
    showToast('Household member added. Review the declared household size.');
  });
  listen('release-button', 'click', async () => {
    if (!intake.assessment?.eligible || intake.completed || mutationBusy) return;
    mutationBusy = true;
    try {
      const ready = await api(`/api/assessments/${intake.assessment.id}/confirm`, { method: 'POST', body: {} });
      intake.readyAt = ready.readyAt; showStep('release');
    } catch (error) { showToast(error.message); }
    finally { mutationBusy = false; renderRelease(); }
  });

  listen('receipt-ack', 'change', renderRelease);
  listen('personnel-name', 'input', renderRelease);
  listen('personnel-id', 'input', renderRelease);
  const actualGoodsChanged = () => { if ($('receipt-ack')) $('receipt-ack').checked = false; renderRelease(); };
  Object.keys(ENTITLEMENT).forEach((key) => { listen(`actual-${key}`, 'input', actualGoodsChanged); listen(`actual-${key}`, 'change', actualGoodsChanged); });
  listen('release-variance-reason', 'input', renderRelease);
  listen('confirm-release', 'click', async () => {
    if (!intake.reservation || intake.completed || mutationBusy || !$('receipt-ack')?.checked) return;
    mutationBusy = true; renderRelease();
    try {
      showError('release-error', '');
      const receipt = await api(`/api/releases/${intake.reservation.id}/complete`, { method: 'POST', body: { acknowledged: true } });
      intake.completed = true; intake.receipt = receipt;
      await refreshWorkspace(); currentStep = 'release'; renderWorkflow();
      showToast('Release saved. The receipt is available in claim history.');
    } catch (error) {
      showError('release-error', `${error.message} Handover ${intake.reservation.id} remains pending. Keep this reference and retry confirmation; do not hand over another package.`);
    } finally { mutationBusy = false; renderRelease(); }
  });

  listen('profile-confirmed', 'change', () => {
    const confirmed = Boolean($('profile-confirmed')?.checked);
    if (!intake.verified || !registeredRecord() || !registryAvailable()) { if ($('profile-confirmed')) $('profile-confirmed').checked = false; return; }
    intake.profileConfirmed = confirmed;
    invalidateAssessment();
    if (confirmed) logAudit('Personnel confirmed beneficiary profile', { confirmed: true });
    renderWorkflow();
  });
  listen('reject-match', 'click', () => {
    if (!intake.verified || !registeredRecord() || intake.completed) return;
    logAudit('Personnel rejected simulated match', { reason: 'Profile does not belong to the person at the desk', reviewNote: true });
    restartCapture({ auditReason: 'Match rejected by personnel' });
    showToast('Match rejected and logged for review. Capture both modalities again.');
  });
  listen('capture-scenario', 'change', () => {
    if (intake.completed) return;
    if (intake.captureFailed && !intake.verified) {
      intake.pendingRecordId = $('capture-scenario').value;
      return;
    }
    if (intake.verified || intake.capture.face.attempts || intake.capture.fingerprint.attempts) restartCapture({ auditReason: 'Demo match scenario changed', preserveFields: true });
    intake.pendingRecordId = $('capture-scenario')?.value === 'new' ? null : $('capture-scenario')?.value;
  });
  let registryPauseStep = null;
  listen('registry-unavailable', 'change', () => {
    logAudit(registryAvailable() ? 'Demo registry restored' : 'Demo registry unavailable · session paused', { available: registryAvailable(), enteredDataRetained: true });
    if (!registryAvailable()) {
      registryPauseStep = currentStep;
      if ($('identity-results')) $('identity-results').innerHTML = '';
      closeDialog($('record-dialog'));
      invalidateAssessment();
      showError(currentStep === 'details' ? 'form-error' : 'verification-error', 'Registry unavailable. Entered data is retained. Restore the registry and retry before saving or releasing.');
    } else {
      ['verification-error', 'form-error', 'release-error'].forEach((id) => showError(id, ''));
      if (intake.pendingMatch) resolveCapturedMatch();
      else if (registryPauseStep === 'details' && canVisitStep('details')) currentStep = 'details';
      registryPauseStep = null;
      if (intake.verified && !intake.assessment && intake.detailsSaved) showToast('Registry restored. Review the profile and retry eligibility.');
    }
    renderAll();
  });
  listen('batch-status', 'change', () => { batchDirty = true; invalidateAssessment(); });
  listen('batch-income-limit', 'input', () => { batchDirty = true; invalidateAssessment(); });
  ['batch-activity','batch-label'].forEach(id => listen(id, 'input', () => { batchDirty = true; invalidateAssessment(); }));
  listen('save-batch-settings', 'click', async () => {
    try {
      await api('/api/batch', { method: 'PUT', body: { activity: $('batch-activity').value.trim(), label: $('batch-label').value.trim(), status: $('batch-status').value, incomeLimit: $('batch-income-limit').value || null, version: batchVersion } });
      batchDirty = false; await refreshWorkspace(); showToast('Batch settings saved.');
    } catch (error) { showToast(error.message); if (error.status === 409) { batchDirty = false; await refreshWorkspace().catch(() => {}); } }
  });

  listen('cancel-release', 'click', () => {
    if (intake.completed || !intake.assessment?.eligible) return;
    $('cancel-release-form')?.reset();
    openDialog('cancel-release-dialog');
  });
  if ($('cancel-release-form')) $('cancel-release-form').noValidate = true;
  listen('cancel-release-form', 'submit', async (event) => {
    event.preventDefault();
    if (intake.completed || !intake.assessment?.eligible) return;
    const reason = $('cancel-release-reason')?.value.trim() || '';
    if (!reason) { showToast('Record why the beneficiary declined the goods.'); $('cancel-release-reason')?.focus(); return; }
    try { if (intake.reservation) { await api(`/api/releases/${intake.reservation.id}/cancel`, { method: 'POST', body: { reason, goodsNotHandedOver: $('cancel-not-handed')?.checked === true } }); intake.reservation = null; intake.idempotencyKey = null; await refreshWorkspace(); } else await logAudit('Release cancelled', { reason }); } catch (error) { showError('cancel-error', error.message); return; }
    closeDialog($('cancel-release-dialog'));
    if ($('receipt-ack')) $('receipt-ack').checked = false;
    showStep('eligibility');
    showToast('Decline recorded. No claim was added; the beneficiary remains eligible.');
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

  function populateCaptureScenarios() {
    if (!$('capture-scenario')) return;
    const selected = $('capture-scenario').value;
    $('capture-scenario').replaceChildren(new Option('Not found · new beneficiary', 'new'));
    records.forEach(record => {
      const previous = claims.some(c => c.recordId === record.id);
      $('capture-scenario').add(new Option(`${nameOf(record)} · ${hasBeneficiaryClaim(record) ? 'already claimed' : previous ? 'previous batch only' : 'no previous claims'}`, record.id));
    });
    $('capture-scenario').value = records.some(r => r.id === selected) ? selected : 'new';
  }

  async function api(path, {method = 'GET', body} = {}) {
    let response;
    try {
      response = await fetch(path, {method, credentials: 'same-origin', headers: {'Content-Type': 'application/json', ...(csrfToken ? {'X-CSRF-Token': csrfToken} : {})}, ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(15000)});
    } catch (error) { databaseOnline = false; hidden('connection-banner', false); throw new Error('Connection unavailable. Your entries are kept. Reconnect and retry.'); }
    const data = await response.json();
    databaseOnline = response.status < 500; hidden('connection-banner', databaseOnline);
    if (!response.ok) {
      if (response.status === 401 && currentUser) { currentUser = null; document.body.classList.add('auth-pending'); hidden('auth-screen', false); text('auth-description', 'Your session expired. Sign in again.'); }
      throw Object.assign(new Error(data.error || 'The request could not be saved.'), data, {status: response.status});
    }
    return data;
  }
  async function refreshWorkspace() {
    const data = await api('/api/workspace');
    records.splice(0, records.length, ...data.records);
    claims.splice(0, claims.length, ...data.claims);
    audit.splice(0, audit.length, ...data.audit);
    pendingHandovers = data.pending; savedDraft = data.draft;
    ACTIVITY = data.batch.activity; BATCH_ID = data.batch.id; BATCH_LABEL = data.batch.label;
    if (!batchDirty) { batchVersion = data.batch.version; assignField('batch-status', data.batch.status); assignField('batch-income-limit', data.batch.income_limit ?? ''); assignField('batch-activity', data.batch.activity); assignField('batch-label', data.batch.label); }
    Object.assign(ENTITLEMENT, data.batch.entitlement);
    hidden('resume-draft-button', !savedDraft);
    renderAll();
  }
  let initialSetup = false;
  async function initializeSession() {
    try {
      const session = await api('/api/session');
      initialSetup = session.setupRequired;
      document.querySelectorAll('.setup-only').forEach(element => { element.hidden = !initialSetup; element.querySelector('input').required = initialSetup; });
      text('auth-heading', initialSetup ? 'Create your first staff account' : 'Staff sign in');
      text('auth-description', initialSetup ? 'Create a staff account to get started.' : 'Sign in to continue.');
      text('auth-submit', initialSetup ? 'Create account and sign in' : 'Sign in');
      $('auth-submit').disabled = false; $('auth-password').minLength = initialSetup ? 12 : 1;
      if (session.user) await openWorkspace(session);
    } catch (error) { showError('auth-error', error.message); text('auth-description', 'The workspace is unavailable. Reopen this page after the connection is restored.'); }
  }
  async function openWorkspace(session) {
    currentUser = session.user; csrfToken = session.csrfToken;
    intakeContext = 'verification'; registrationState = createIntake(); verificationState = createIntake(); intake = verificationState;
    await refreshWorkspace();
    text('staff-name', currentUser.fullName); text('staff-number', currentUser.staffNumber);
    text('staff-avatar', currentUser.fullName.split(/\s+/).slice(0, 2).map(n => n[0]).join(''));
    assignField('personnel-name', currentUser.fullName); assignField('personnel-id', currentUser.staffNumber);
    const requested = window.location.hash.slice(1) || window.location.pathname.replace(/^\/|\/$/g, '');
    resetIntake(); entrySelected = true; showView(Object.hasOwn(VIEWS, requested) ? requested : 'overview');
    hidden('auth-screen', true); document.body.classList.remove('auth-pending');
    if (savedDraft) showToast('A saved intake draft is available. Use Resume saved draft to restore its details.');
  }
  function renderPending() {
    if (!$('pending-list')) return;
    $('pending-list').innerHTML = pendingHandovers.length ? pendingHandovers.map(item => `<article class="pending-row"><div><strong>${escapeHTML(item.beneficiary)}</strong><small>${escapeHTML(item.id)} · ${escapeHTML(formatDateTime(item.preparedAt))}</small><small>${escapeHTML(goodsText(item.goods))}</small><small>Prepared by ${escapeHTML(item.personnelName)}</small></div><button class="button secondary" type="button" data-resume-handover="${escapeHTML(item.id)}">Resume handover</button></article>`).join('') : '<p class="empty-state">No handovers are awaiting confirmation.</p>';
  }
  function populateFamilyOptions() {
    const select = $('member-existing'); if (!select) return;
    const query = normalize($('member-search')?.value);
    const selected = select.value;
    select.replaceChildren(new Option('Not registered · enter details below', ''));
    records.filter(person => person.id !== intake.recordId && (!query || normalize(`${nameOf(person)} ${person.id}`).includes(query))).forEach(person => select.add(new Option(`${nameOf(person)} · ${person.birthDate} · ${person.barangay} · ${person.id}`, person.id)));
    select.value = [...select.options].some(option => option.value === selected) ? selected : '';
    $('member-name').readOnly = Boolean(select.value); $('member-age').readOnly = Boolean(select.value);
  }
  actions.logout = async () => {
    try { await api('/api/logout', {method: 'POST', body: {}}); window.location.reload(); } catch (error) { showToast(error.message); }
  };
  actions['new-staff'] = () => { $('staff-form').reset(); showError('staff-error', ''); openDialog('staff-dialog'); };
  actions['resume-draft'] = () => {
    if (!savedDraft) return showToast('No saved draft is available.');
    const draft = {...savedDraft};
    newRegistration();
    if (intakeContext !== 'registration') return;
    intake.fields = draft.fields; intake.members = draft.members || []; intake.recordId = draft.recordId || null;
    if(draft.enrollment) intake.enrollment={...draft.enrollment};
    intake.profileVersion = draft.version || null; intake.registrationKey = draft.registrationKey || crypto.randomUUID(); intake.draftSaved = true;
    writeFields(); renderWorkflow(); showToast('Registration draft restored. Save the profile when ready.');
  };

  listen('auth-form', 'submit', async event => {
    event.preventDefault(); $('auth-submit').disabled = true; showError('auth-error', '');
    const body = {username: $('auth-username').value, password: $('auth-password').value};
    try {
      if (initialSetup) { await api('/api/setup', {method: 'POST', body: {...body, fullName: $('auth-name').value, staffNumber: $('auth-staff-number').value}}); initialSetup = false; document.querySelectorAll('.setup-only').forEach(element => {element.hidden = true; element.querySelector('input').required = false;}); text('auth-heading', 'Staff sign in'); text('auth-submit', 'Sign in'); }
      const session = await api('/api/login', {method: 'POST', body});
      await openWorkspace(session); $('auth-form').reset();
    } catch (error) { showError('auth-error', error.message); }
    finally { $('auth-submit').disabled = false; }
  });
  listen('staff-form', 'submit', async event => {
    event.preventDefault(); const button = $('staff-form').querySelector('[type="submit"]'); button.disabled = true;
    try { await api('/api/staff', {method: 'POST', body: {fullName: $('new-staff-name').value, staffNumber: $('new-staff-number').value, username: $('new-staff-username').value, password: $('new-staff-password').value}}); closeDialog($('staff-dialog')); $('staff-form').reset(); await refreshWorkspace(); showToast('Staff account created.'); }
    catch (error) { showError('staff-error', error.message); } finally { button.disabled = false; }
  });
  listen('reconnect', 'click', async () => { try { await refreshWorkspace(); showToast('Connection restored. Your entries were kept.'); } catch (error) { showToast(error.message); } });
  listen('member-search', 'input', populateFamilyOptions);
  listen('member-existing', 'change', () => {
    const person = records.find(record => record.id === $('member-existing').value);
    $('member-confirm-link').checked = false;
    $('member-name').readOnly = Boolean(person); $('member-age').readOnly = Boolean(person);
    if (person) { assignField('member-name', nameOf(person)); assignField('member-age', ageFromBirthDate(person.birthDate)); }
  });
  listen('reserve-release', 'click', async () => {
    if (mutationBusy || intake.reservation || !intake.assessment?.id) return;
    mutationBusy = true; renderRelease(); intake.idempotencyKey ||= crypto.randomUUID();
    try {
      showError('release-error', '');
      intake.reservation = await api('/api/releases', {method: 'POST', body: {assessmentId: intake.assessment.id, idempotencyKey: intake.idempotencyKey, goods: readActualGoods(), varianceReason: $('release-variance-reason').value.trim()}});
      await refreshWorkspace(); showToast('Handover prepared and saved. Hand over the goods, then confirm receipt.');
    } catch (error) { showError('release-error', error.message); }
    finally { mutationBusy = false; renderRelease(); }
  });
  document.addEventListener('click', async event => {
    const resume = event.target.closest('[data-resume-handover]');
    if (resume) {
      try { await refreshWorkspace(); } catch (error) { showToast(error.message); return; }
      const item = pendingHandovers.find(row => row.id === resume.dataset.resumeHandover);
      const record = records.find(row => row.id === item?.recordId);
      if (!item || !record) return showToast('This handover was completed or cancelled at another counter.');
      beginIntake('returning'); intake.recordId = record.id; intake.verifiedRecordId = record.id;
      intake.fields = Object.fromEntries(Object.keys(FIELD_IDS).map(key => [key, record[key]])); intake.members = cloneMembers(record.members);
      intake.verified = true; intake.detailsSaved = true; intake.profileConfirmed = true; intake.method = item.method;
      intake.reservation = item; intake.readyAt = item.eligibilityConfirmedAt; intake.assessment = {eligible: true, status: 'ready', rules: []};
      writeFields(); Object.entries(item.goods).forEach(([key, amount]) => assignField(`actual-${key}`, amount)); assignField('release-variance-reason', item.varianceReason);
      showStep('release');
    }
    const receiptButton = event.target.closest('[data-saved-receipt]');
    if (receiptButton) {
      try { const receipt = await api(`/api/receipts/${encodeURIComponent(receiptButton.dataset.savedReceipt)}`); renderPrintableReceipt(receipt); window.print(); }
      catch (error) { showToast(error.message); }
    }
  });
  setInterval(() => { if (currentUser && !mutationBusy && !document.hidden) refreshWorkspace().catch(() => {}); }, 20000);

  await initializeSession();
  writeFields(); renderCaptureMode(); renderAll(); routeFromHash(); syncSidebarAccess();
})();
