# DSWD relief distribution workspace

A responsive front-end prototype for the DSWD Relief Goods Distribution System. The opening screen distinguishes a first-time registration from a returning beneficiary. New households register their details before identity verification, eligibility assessment, and goods release.

## Open it

Open `index.html` in a modern browser. No build step, database, or package installation is needed. Styles, icons, agency artwork, and application logic are local. The interface uses Arial and system fonts, so it also works offline.

To preview over HTTP, run `python -m http.server 8765 --bind 127.0.0.1` from this directory and open `http://127.0.0.1:8765`.

## Included workflows

- **Overview:** live sample household totals, hourly releases, activity progress, recent records, and remaining stock.
- **Register & verify:** four gated steps — register household details, verify the saved beneficiary, assess eligibility, and confirm handover. First-time beneficiaries choose **New registration**; returning beneficiaries open verification for their existing record.
- **Registration form:** record first/middle names, last name, date of birth with calculated age, sex/gender, civil status, region, province/metropolitan area, city, barangay, street address, household size, numeric household income, and a monthly or annual income period. Contact details are required; use **Not available** when none exist. A valid ID or supporting document reference is optional.
- **Identity verification:** acknowledge the demo privacy notice, find a registered sample profile by name or ID, inspect the displayed details and claims, and simulate face/fingerprint verification or document a manual alternative. Choosing a profile alone does not verify identity.
- **Household records:** add/remove linked members and save a session draft while navigating between sections. Editing saved registration details requires verification and eligibility checks again.
- **Eligibility:** explain example coverage, identity, profile, previous-claim, and stock checks. Released households and households outside the sample activity coverage cannot proceed to release.
- **Handover:** require the releasing personnel name and ID plus receipt acknowledgment, record one transaction per household and batch, deduct one package, and update the dashboard and directory. The printable receipt and claim history identify the batch and responsible personnel. A completed intake is locked; start the next intake to register another beneficiary.
- **Beneficiaries:** search and filter the directory, inspect a record, and continue its verification.
- **Claim history:** search confirmed releases, inspect personnel and batch information, and export the complete demo claim history across batches as CSV. The export excludes beneficiary names and addresses.
- **Inventory:** inspect allocation, available stock, distribution totals, and illustrative package contents.

## Try it

1. On the opening screen, choose **New registration** to confirm a first-time registration.
2. Complete the form or choose **Fill sample details**, review the household, and choose **Save registration & continue**.
3. Acknowledge the privacy notice and simulate face, fingerprint, or manual verification for the saved profile. Inspect the profile and claims, then continue to eligibility.
4. Review the example checks and prepare the package. Confirm the releasing personnel details, acknowledge receipt, and record the release.
5. Check the receipt, dashboard, inventory, and claim history. Choose **Register next beneficiary** to begin another intake.
6. To try a returning household, choose **Verify returning beneficiary**. Find **Marites Santos** for a current-batch claim that blocks another release, or **Ana Reyes** for an existing record with a previous-batch claim and no current-batch release.

Drafts, records, and transactions are held only in memory while the page is open. Refreshing restores the seeded sample workspace. No camera, fingerprint device, biometric matching, authentication, or backend service is connected. Simulated capture cannot recognize a person or establish identity. The example eligibility rules, batch records, personnel details, and package contents are illustrative; production registration, matching, claim enforcement, and audit storage require secured backend services.

The layout supports mobile navigation, keyboard controls, visible focus, labeled forms, native accessible dialogs, reduced motion, and a dedicated receipt print layout.

The official DSWD logo, compact agency mark, and Bagong Pilipinas artwork appear in the navigation, mobile header, footer, favicon, and printable receipts. The interface uses DSWD blue with restrained red and yellow accents. Artwork is stored unchanged and displayed at its original proportions. See [branding source notes](assets/branding/README.md) for official agency sources.

See `SYSTEM_PLAN.md` for backend delivery phases, staff roles, audit requirements, and the full production workflow.
