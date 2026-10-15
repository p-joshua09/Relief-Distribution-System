# DSWD Relief Goods Distribution System

A staff-operated distribution workspace with a Node.js backend and PostgreSQL. Staff sign in, register or find beneficiaries, link family members, assess the active batch, prepare a handover, and save the release and receipt.

## Start locally

Use Node.js 22 or newer.

```powershell
npm install
npm run db:local
```

Keep the database terminal open. In a second terminal:

```powershell
npm start
```

Open http://127.0.0.1:8765. On the first visit, create the first staff account from the computer running the server. There are no default usernames or passwords. A signed-in staff member can create additional accounts using **Add staff account**. Every account has the same access.

The local database helper initializes a persistent PostgreSQL cluster on port 55432 and creates an ignored `.env` containing its connection details. It remembers the data directory in the private `.local/postgres-settings.json` file. Keep these files private and preserve the database directory when moving the project. Restart the database with `npm run db:local`; it reuses existing data.

On Windows, PostgreSQL requires an ASCII path for the local runtime and data. If the project path contains non-ASCII characters and no directory has been configured yet, choose a durable directory before the first start:

```powershell
$env:LOCAL_POSTGRES_HOME = Join-Path $env:LOCALAPPDATA 'ReliefDistribution\Postgres'
npm run db:local
```

The chosen path is remembered for later starts. The helper copies the bundled PostgreSQL runtime there; it does not install a Windows service or alter an existing PostgreSQL installation.

## Connect an existing PostgreSQL database

Create a dedicated database and set `DATABASE_URL` in `.env`, using `.env.example` as a reference. `npm start` applies the versioned schema migrations automatically. `npm run db:migrate` applies them separately. The application never connects to PostgreSQL directly from the browser.

The default server listens only on 127.0.0.1. For a shared deployment, configure the host and database connection, serve through HTTPS, and set `COOKIE_SECURE=true`. The bundled PostgreSQL helper is intended for local development; a shared deployment should use a managed or independently maintained PostgreSQL service.

## Registration and Verification pages

**Registration** is above **Verification** in the sidebar. Both have distinct URLs that support direct opening and browser refresh:

- `/registration`: create or edit personal details, household information, and family links. New registrations require a privacy acknowledgment and both simulated face and fingerprint enrollment captures. Partial captures can be saved in a draft. Profiles save independently of verification and the active distribution batch. A saved profile offers **Verify this beneficiary**.
- `/verification`: select an existing beneficiary, run the simulated or valid-ID verification flow, confirm the profile and current-batch claim history, assess eligibility, and prepare/finalize a handover.

Saving a registration does not verify identity, mark a beneficiary eligible, or create a claim. Verification and eligibility are required before any release. Registration entries and an ongoing verification retain their own page state when navigating between them.

Distribution and batch names shown across the workspace come from saved batch settings. Change them under **Verification → Batch settings**. Location fields start blank, and no station or operating location is displayed without configured information. Capture controls show a short **Demo mode** label; repeated implementation notes and decorative copy have been removed.

## Applied scope

- Staff login/logout with hashed passwords, expiring database sessions, HttpOnly cookies, and request protection. One account type; no hierarchy or extra approval after login.
- Signed-in staff identity automatically recorded for releases, profile changes, and audit events. No Maria Garcia account or seeded fictional beneficiary/claim records.
- PostgreSQL-backed profiles, optional identification references, declared household members, actual links to existing beneficiaries, verification records, assessments, batch settings, drafts, releases, and audit history.
- Individual claim history is read-only. One active handover or completed claim per beneficiary per batch is enforced in PostgreSQL. A family member's claim does not block a different individual.
- Inventory screens, allocated quantities, stock balances, deductions, and stock-based eligibility gates are removed. Entitlement and actual goods remain part of the release record.
- Registration and family links save together. Optimistic profile versions prevent one counter silently overwriting another counter's changes. Retrying an unchanged new registration returns the same saved profile.
- Prepare a handover **before giving goods**. This saves a pending record and occupies the batch claim slot. Confirm receipt after handover. If confirmation fails, retain the reference and retry or resume from **Pending handovers**. Never hand out a second package during recovery.
- Pending handovers survive refresh, logout, and server restarts. Any signed-in staff member can resume one. Cancel only when goods have not been handed over; cancellation retains history and frees the slot.
- Actual goods that differ from the entitlement require a recorded reason. No supervisor approval or notification workflow is required.
- Saved receipts can be retrieved and printed from claim history. Retrying confirmation or reprinting does not create a second claim.
- Audit events are permanently saved with the responsible staff account. The UI displays the latest 500; the database retains older events. Application audit records cannot be edited or deleted through the interface.

## Deferred biometric work

Face and fingerprint enrollment, verification capture, quality results, and matching remain explicit simulations. No camera/scanner integration, real facial recognition, biometric matching, biometric images, or encrypted biometric templates have been implemented. The system stores simulated enrollment completion times and the responsible staff member with each profile, plus simulated verification results or valid-ID verification references and reasons. Enrollment is retained during profile edits. Simulated enrollment and verification are not proof of a person's identity.

The existing failed-capture path allows a signed-in staff member to record valid-ID verification for an existing beneficiary without another account approving it.

## Checks

Start PostgreSQL first, then run:

```powershell
npm test
npm run test:browser
```

The API and browser tests create their own temporary PostgreSQL schemas and remove only those schemas afterward. They never seed or erase the application's normal beneficiary data. API checks cover authentication, atomic registration/family links, optimistic edits, duplicate review, competing counters, idempotent requests, failed saves, cancellation, receipts, and persistence. Browser checks cover first-account setup, login, registration, family linking, pending handover recovery, failed confirmation and retry, duplicate blocking, receipt printing, logout, and desktop/mobile layouts.

Windows browser checks use installed Microsoft Edge. Set `PLAYWRIGHT_CHANNEL` for another installed browser, or install Playwright Chromium and select it through the test configuration. Screenshots are written to the ignored `test-results` directory. The former static-demo checks in `tests/workflow.test.cjs` are historical; the current browser entry point is `npm run test:browser`.
