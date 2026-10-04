# DSWD Relief Goods Distribution System Plan

## Purpose

The system should help DSWD personnel register and identify beneficiaries, prevent duplicate claims, assess eligibility consistently, release the correct goods, and maintain an auditable record of every transaction. Biometrics support identity verification, but staff must also have a controlled manual process for cases where biometric capture is unavailable or unsuccessful.

## Recommended user roles

### Registration personnel

- Register beneficiaries and capture consent.
- Capture facial and fingerprint data.
- Update personal, contact, location, and vulnerability information.
- Link people to the correct household.

### Eligibility officer

- Review identity matches, claim history, household membership, and eligibility rules.
- Approve, reject, or refer questionable cases for review.
- Record a reason for every manual decision.

### Release personnel

- View approved beneficiaries and assigned relief packages.
- Confirm the actual handover and beneficiary acknowledgment.
- Record failed, cancelled, or partial releases.

### Warehouse or inventory personnel

- Receive and record relief stock.
- Define package contents and quantities.
- Transfer stock to distribution sites and reconcile remaining inventory.

### Supervisor and administrator

- Create distribution activities and eligibility policies.
- Manage staff accounts, roles, devices, locations, and reference data.
- Review exceptions, duplicate records, audit logs, and reports.

## Essential use cases missing from the current narrative

### 1. Authenticate staff and control access

Personnel must sign in and only see actions allowed by their role. Sessions should expire after inactivity, and sensitive operations should require re-authentication or supervisor approval.

### 2. Manage a distribution activity

An authorized user creates an activity with its disaster or program name, location, schedule, target barangays, eligibility policy, household claim limit, and assigned relief package. Activities can be prepared, opened, paused, closed, and archived.

### 3. Search before registration

Personnel should search by biometric match, beneficiary ID, name, birth date, address, and household before creating a record. Possible duplicates should be reviewed instead of automatically creating another beneficiary.

### 4. Record consent and privacy acknowledgment

Before biometric capture, personnel should explain why data is collected, how it will be used, and how long it will be retained. The system records the beneficiary's consent or the approved legal basis and the staff member who captured it.

### 5. Handle failed biometric capture

The system needs a fallback for worn fingerprints, injuries, camera failure, disability, children, older persons, and unavailable devices. Manual verification should require supporting information, a reason, and appropriate approval.

### 6. Manage beneficiary and household relationships

Personnel can add, remove, or correct household members and relationship types. The system should prevent a person from belonging to conflicting active households and retain a history of relationship changes.

### 7. Resolve duplicate beneficiary records

Authorized personnel review likely duplicates, compare personal and biometric information, and merge or mark records as separate people. The system keeps the original record IDs and a complete audit trail.

### 8. Configure and assess eligibility rules

Rules should be attached to each distribution activity rather than hard-coded. Assessment should consider location, household status, vulnerability criteria, prior claims, and program-specific limits. The result must show which rules passed or failed.

### 9. Review exceptions and appeals

Ineligible or disputed cases can be referred to a supervisor. The reviewer records the decision, reason, evidence, date, and approving officer. Overrides must never silently replace the original automated result.

### 10. Manage relief goods and inventory

The system records item stocks, package composition, transfers, damaged goods, releases, and remaining quantities. A release cannot exceed available stock, and every adjustment needs a reason and responsible staff member.

### 11. Confirm receipt

The beneficiary acknowledges receipt using a signature, biometric confirmation, or documented alternative. The receipt includes the activity, package, quantity, date, location, and releasing personnel.

### 12. Cancel or correct a transaction

Authorized personnel may void an incorrect release or correct a record without deleting the original transaction. Every correction requires a reason and remains visible in the audit history.

### 13. Support offline distribution sites

Remote sites may temporarily operate without reliable internet. The front end should show offline status, store queued transactions securely, prevent local duplicates, and clearly report synchronization conflicts when connectivity returns.

### 14. Maintain audit logs

The system records sign-ins, searches, profile views, edits, biometric checks, eligibility decisions, overrides, inventory changes, and releases. Audit records should identify who performed the action, when, where, and what changed.

### 15. Provide operational and compliance reports

Reports should cover registered households, eligible and rejected beneficiaries, releases by location and time, inventory movement, duplicate attempts, exceptions, and staff activity. Personal data should be minimized in exported reports.

### 16. Monitor biometric devices and station health

Personnel need a clear status for the camera, fingerprint scanner, printer, network, local queue, and last synchronization. Device failures should produce actionable instructions and be logged.

## Recommended delivery phases

### Phase 1 Minimum viable system

- Staff sign-in and role-based access
- Distribution activity setup
- Beneficiary search and registration
- Consent capture
- Face and fingerprint capture with manual fallback
- Household relationships
- Claim history and duplicate detection
- Configurable eligibility assessment
- Goods release and receipt confirmation
- Basic inventory deduction
- Audit logging

### Phase 2 Operational controls

- Duplicate-record review and merging
- Supervisor exceptions and appeals
- Full warehouse and stock-transfer workflow
- Offline operation and conflict resolution
- Device monitoring
- Operational dashboards and downloadable reports

### Phase 3 Integration and scale

- Integration with approved DSWD registries and identity sources
- Cross-region beneficiary matching under approved data-sharing rules
- Advanced fraud-risk indicators with human review
- Disaster response analytics and forecasting
- Data retention, archival, and automated disposal workflows

## Important non-functional requirements

- Follow the Data Privacy Act of 2012 and applicable DSWD privacy and security policies.
- Encrypt biometric and personal data in transit and at rest.
- Store biometric templates securely rather than exposing raw images where possible.
- Apply least-privilege access and maintain immutable audit records.
- Provide accessible keyboard navigation, clear labels, sufficient contrast, and understandable error messages.
- Support slow networks, common desktop resolutions, tablets, and station printers.
- Define backup, recovery, retention, breach-response, and account-revocation procedures before deployment.
- Require human review for uncertain biometric matches and eligibility exceptions.

## Suggested end-to-end workflow

1. The system opens the registration screen before other workspace options, even when an old workspace URL is present.
2. The beneficiary confirms whether this is their first registration. **New registration** opens the general-details form; an already registered beneficiary continues to the verification counter.
3. New beneficiaries provide their full name, date of birth (with calculated age), sex/gender, civil status, address and region/province/city/barangay, household income and monthly/annual period, household member count, contact information, and an optional valid ID reference. The system saves a registered profile before a claim can proceed.
4. At the counter, staff records the privacy acknowledgment and identifies the registered profile. The production system captures face/fingerprint input and compares it to the approved registered database; the front-end prototype explicitly simulates verification for the selected saved profile.
5. The system retrieves the beneficiary profile and individual/household claim history, distinguishing previous batches from the active distribution batch.
6. The system checks the registered profile, verification, activity coverage, current-batch claim limit, and available stock. A current-batch claim blocks another release; a previous-batch claim alone does not.
7. DSWD personnel reviews the eligible profile and allotted relief package. A supervisor handles exceptions in the production system.
8. The releasing personnel enters or confirms their name and staff ID, hands over the goods, and records the beneficiary acknowledgment.
9. The system records one transaction with the registered beneficiary, batch ID/name, goods and quantity, date/time, verification method, and personnel snapshot. It updates claim history and current-batch inventory together and prevents a second submission.
10. The system displays a successful distribution confirmation and a printable receipt containing the same transaction and personnel details.

The current implementation keeps fictional records and transactions in memory. Refreshing resets the sample workspace. Live biometric capture, database matching, staff authentication, and durable transaction storage remain production integrations; the prototype does not collect biometric data or imply a real biometric match.
