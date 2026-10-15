# Relief distribution system implementation plan

## Approved scope

The confirmed implementation uses PostgreSQL and a single staff account type. Staff login is retained. All signed-in staff have equal access; manual verification and release need no additional supervisor approval. Inventory management and stock-based release gates are excluded. Face recognition, real biometric capture/matching, and biometric-template storage remain deferred.

## Separate pages

The latest UI clarification gives Registration and Verification separate pages, with Registration first in navigation. New registrations require privacy acknowledgment and separate simulated face and fingerprint enrollment captures. Enrollment completion times and the responsible staff member are saved with the profile; partial captures can be saved in drafts. Registration saves profiles and family links without requiring a verification session. It uses an authenticated, idempotent registration request. Verification remains mandatory for eligibility and release. This replaces the earlier combined verification-first registration wizard.

## Implemented counter workflow

1. Staff sign in. The first account is created locally during setup; signed-in staff can add other equal-access accounts.
2. Register a new beneficiary on Registration, or choose an existing beneficiary on Verification. On Verification, acknowledge the notice. The existing face/fingerprint path remains explicitly simulated. After a simulated capture failure, valid-ID verification for an existing beneficiary records the staff member, ID reference, and reason.
3. On Registration, encode a new beneficiary or edit an existing profile. Review possible duplicates; use the existing profile or document why it is a different individual. Government ID is optional during normal registration.
4. Link spouse, child, or another family member to a confirmed existing beneficiary ID. Unregistered relatives remain declared household-member entries, without silently enrolling them as beneficiaries.
5. Save the profile and family links atomically, then open the separate Verification page when ready. A failed save retains the entered details. Repeating an unchanged registration request returns the same profile. Profile versions prevent silently overwriting another counter's edits.
6. Retrieve the individual's recorded claims and confirm the profile with the beneficiary. Assess the active batch and its saved income rule. Personnel confirm an eligible result before preparing a handover.
7. Record actual quantities and a reason for differences. Prepare the handover before giving goods. PostgreSQL reserves the individual/batch slot, including against other counters.
8. Hand over the goods, obtain the beneficiary's acknowledgment, and confirm receipt. Finalizing saves one release reference, time, responsible staff member, actual items, claim history, and audit event together.
9. If finalization fails after physical handover, keep the pending reference and retry. Pending handovers can be resumed after refresh or by another signed-in staff member. A saved receipt is issued only after finalization succeeds.
10. If the beneficiary declines before goods are handed over, cancel with a reason and confirmation that no handover occurred. Cancellation remains in the audit/history and frees the claim slot.
11. Retrieve or print saved receipts from claim history. Reprints and retries do not create another release.

## Data handling

- `staff` and `sessions`: equal-access accounts, password hashes, hashed session tokens, CSRF tokens, and expiry.
- `beneficiaries`: personal details, optional ID, address/contact/income, stable record IDs, and optimistic versions.
- `family_members`: declared information or a foreign-key link to another beneficiary. Linked names and ages are read from that person's current profile.
- `batches`: active/paused/closed state, income policy, entitlement, and version.
- `verifications` and `assessments`: staff identity, simulated or valid-ID method, beneficiary, assessment result, confirmation time, and the profile/batch versions assessed.
- `claims` and `claim_items`: pending/released/cancelled handovers, unique request keys, snapshots, actual quantities, reasons, staff, timestamps, and saved receipt references.
- `audit_events`: append-only staff actions and profile corrections. The application exposes no history-editing endpoints.
- `staff_drafts`: resumable intake details owned by the signed-in staff account. Drafts restore to the independent Registration page; verification is performed separately before distribution.

The browser uses the backend API. Database credentials stay in the server environment. Registration and release writes use PostgreSQL transactions. A unique partial index permits only one pending or released handover per individual/batch; cancellations remain recorded but free that slot. A relative's claim and previous-batch claims do not make another individual ineligible.

## Remaining work outside the approved implementation

Real face/fingerprint devices, measured capture quality, biometric enrollment and matching, encrypted templates, and handling a newly registering person who cannot provide usable biometrics require a separate decision and implementation. Shared deployment also needs an operational database service, HTTPS configuration, backups, monitoring, and a reviewed retention policy appropriate to its use.

The attached original narrative still describes supervisor approval and stock checks. This implementation follows the later user-confirmed scope; the original DOCX and its explanatory visualization have not been rewritten.
