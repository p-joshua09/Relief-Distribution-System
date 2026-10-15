# Use case implementation review

Source: `C:/Users/joshu/Downloads/use-case-narrative-2.0 (1).docx`. The document is requirements material. Its original file remains unchanged.

## Latest page separation

Registration and Verification now have independent URLs. Registration appears above Verification in navigation. The latest clarification adds required simulated face and fingerprint enrollment to new registrations, with privacy acknowledgment, capture times, and staff attribution saved in PostgreSQL. Partial enrollment is resumable through staff drafts. Enrollment does not create a verification session or authorize a release. Verification, current-batch claim checking, and eligibility still gate every release. Actual biometric devices and matching remain deferred.

## Confirmed changes to the narrative scope

The user retained staff login, chose one account type with equal permissions, and removed additional approval after login. Inventory and stock accounting are excluded; entitlement and actual goods are retained as transaction details. PostgreSQL is selected. Actual facial recognition, biometric capture/matching, and biometric-template storage are deferred.

| Use case | Current implementation |
| --- | --- |
| RGDS001 Provide Biometric Data | Existing paired capture, quality outcomes, and retries remain simulations. No real biometric data or templates are stored. |
| RGDS002 Retrieve Claim History | PostgreSQL-backed individual history with batch, time, goods, and reference. Current-batch claims and pending handovers block another release. Earlier batches and relatives' claims do not. Profile/history access is audited. |
| RGDS003 Assess Eligibility | Authenticated staff, persistent verification results and batch rules, profile confirmation, and stored assessments. Valid-ID fallback records the signed-in staff member and reason without extra approval. Actual identity matching is deferred. |
| RGDS004 View or Manage Beneficiary Details | Persistent registration and updates, optional ID, duplicate review, confirmed links to existing family members, and declared unregistered relatives. Atomic saves, safe registration retries, version conflict checks, and old/new profile audit events. |
| RGDS005 Distribute Relief Goods | Confirmed eligibility, actual goods, variance reasons, pending handover reservation before physical release, database uniqueness across counters, retry-safe finalization, cancellation before handover, and durable claim/audit records. No inventory balance or supervisor gate. |
| RGDS006 Receive Relief Goods | Beneficiary acknowledgment, saved reference, receipt retrieval/reprinting, and recovery of an interrupted pending handover. No receipt is issued before finalization succeeds. |

## Narrative corrections retained for later document editing

- Standardize RGDS/RDGS identifiers.
- RGDS003 repeats its Includes list under Extends; do not model the duplicate list as extension relationships.
- RGDS006's decline flow should reference RGDS005 A3 rather than nonexistent A4.
- Clarify registration when usable biometrics cannot be captured, and whether the three-attempt limit is per modality or per session.
- Update staff approval and stock language to the confirmed scope before submitting a revised narrative.

`tests/api.test.cjs` and `tests/persistent-workflow.test.cjs` verify the current scope using isolated real PostgreSQL schemas.
