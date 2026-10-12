# Store operations review

# Independent release review

Reviewed the design spec, continuation diff, all four task reports, and current source for API integration, operations, email/auth, staff UI/recovery, account UI, and carousel/CMS. No code was modified and no broad suites were rerun; root owns asset-complete staging checks and build verification.

## Verdict

**Changes requested: two Important issues. No Critical issue found.** Root has already acknowledged both and is preparing the final correction wave. Two small email presentation issues are separated below.

## Important

### 1. New legacy-order packing can bypass every saved count and unfinished DTF

- `commerce_api.py:628-630`: the manual closing guard applies only when `fulfillment_revisions` already has a row.
- `commerce_ops.py:212-213`: `ready_to_handover` only tests `status == 'spakowane'`; `complete` at lines 322-325 accepts that flag.
- Scenario: an existing active legacy order has no revision row until its first persisted progress update. The old Orders status dropdown can PATCH it straight to `spakowane` or `wydane`. Once packed, the new Realizacja endpoint also hands it over with revision 0 and zero picked/printed/checked quantities. An unready purchased DTF task does not prevent this path. Opening/read-only queueing intentionally creates no revision row, so simply opening Realizacja does not activate the guard.
- **Verified via isolated temporary-database HTTP reproduction:** manual pack returned `(200, {'ok': True, 'status': 'spakowane'})`; saved counts were `(0, 0, 0)` and `ready_to_handover=True`; POST completion/handover returned 200. This performed no production writes.
- Minimal fix: disallow new manual closing transitions for every active order, regardless of revision-row presence. Route new pack/handover through saved fulfillment. If already-packed historical orders are deliberately grandfathered, preserve that explicit compatibility but still reject handover when existing DTF production is unfinished. Add targeted HTTP regression for an untracked legacy order and a packed historical order with unfinished DTF.

### 2. POS has no customer association flow

- `storefront/app/admin/POS.tsx:21-24,62-68,102-104`: state, submit construction, and checkout controls contain no selected customer.
- `storefront/app/admin/pos-state.mjs:13-14,28-38`: the canonical request has only items/payment; restoring a signature containing customer_id is rejected.
- Scenario: staff chooses a registered customer for an in-person sale, but the shipped UI offers no account lookup/selection. Every UI sale has null customer_id, so it cannot appear in that customer's account history or trigger the associated-order outbox path. The API already supports and fingerprints customer_id; the feature is blocked at the client.
- Minimal fix: add optional active-customer selection using the existing admin customers endpoint, include the selected ID in canonical sale payload/signature, preserve and freeze it during uncertain retries, and restore it independently of current customer/catalog availability. Keep anonymous sales supported. Add pure recovery coverage proving same-key retries preserve association and changed association cannot silently reuse identity.

## Minor

### 3. Verification UI claims a message was sent while configuration is unknown

- `storefront/components/EmailVerification.tsx:8,12`: configured begins null; the non-false branch says to open the message sent after registration. If status loading fails, this claim remains indefinitely, even when SMTP is absent.
- Minimal fix: use a third loading/unavailable state and describe a queued/requested verification rather than a sent message unless actual delivery status is known. Configured SMTP also does not establish that the worker delivered the registration message.

### 4. Order email omits the test-sale label

- `commerce_email.py:280-281`: order subject/body contain order number, status and amount with no demo/test notice.
- Scenario: once SMTP and POS customer association are enabled, the customer receives an ordinary-looking order confirmation for a demonstrational sale, although POS screen/printed document correctly say test/nonfiscal.
- Minimal fix: label current order emails as test/demo and state that they are not a fiscal receipt or real payment confirmation; include a narrow message-content assertion.

## Other reviewed behavior

- POS backend locks stock and creates stock movements/order/receipt/retry identity atomically under API-owned BEGIN IMMEDIATE. Duplicate normalized key lookup precedes mutable stock/catalog/customer validation, and changed request identity conflicts.
- UI persists unresolved attempts before sending, retains keys across unknown/network/auth failures, and restores without today's stock. Definitive validation rejection permits a fresh identity. No credential or contact address is persisted with the attempt.
- Line progress identifies immutable line_index, checks exact variant scan, increments one unit, validates prior stages and DTF readiness, and rejects stale revisions. Same variant/different prints remain distinct.
- Admin routes retain access/CSRF checks. Public checkout remains gated while registration is available independently.
- Email tokens persist as digests, expire, are atomically consumed, and are tied to current credentials. Reset revokes old sessions/recovery keys; password/key changes invalidate queued auth emails/tokens. Fragment token capture removes the URL fragment. Token creation occurs at worker delivery time, not during an unconfigured queue request.
- Outbox uses bounded attempts and leases, TLS verification, safe metadata, and sanitized delivery errors. Missing SMTP leaves pending messages unsent. SMTP acceptance can be repeated after crash as documented.
- Carousel preserves first-slide settings, uses verified catalog images and illustration metadata, pauses for listed motion/visibility/focus/modal conditions, and extends CMS optional fields without rewriting legacy drafts/revisions.

## Evidence and limits

- Current-tree `git diff --check`: passed during review.
- Isolated HTTP reproduction described above: passed and demonstrated Important issue 1.
- No claim of full suite/build or browser success is made here; those are owned by root on the asset-complete AMS staging snapshot.
- No deployment, commit, production database mutation, or code edit performed.


# Scoped final re-review

Scope: the four findings in `release-review.md`, `.superpowers/continuation/final-fix.diff`, and the accompanying correction report. Reviewed the fix itself for new Important regressions; did not reopen the broader release or rerun root's AMS validation.

## Verdict

**All four findings ADDRESSED. No new Critical or Important issue found in the correction diff.** Source review is approved for this scope; final deployment remains subject to root's clean-proxy full suites, TypeScript, production build, and browser checks.

| Finding | Result | Evidence |
| --- | --- | --- |
| Important 1: legacy manual closing bypass | **ADDRESSED** | Manual transitions into packed/shipped/handed-over states are now blocked for every changed order status, without the revision-row condition. `ready_to_handover` requires all saved counts and production readiness in addition to packed status. New HTTP tests cover untracked active orders, historical packed orders without counts, and unfinished purchased DTF. |
| Important 2: missing POS customer association | **ADDRESSED** | POS loads active accounts, searches names/emails, supports an optional selected account and guest sales, and includes the integer ID in its canonical request. Pending recovery restores the original ID before any live customer validation; the selector is locked while unresolved. Guest signatures retain backward compatibility. Tests cover frozen identity, invalid IDs, own-account history, other-account exclusion, and single queued order email on replay. |
| Minor 3: verification delivery claim while configuration unknown | **ADDRESSED** | Configuration now has explicit checking and unavailable presentations, resets on identity changes, and configured copy describes the queue and future arrival rather than completed delivery. Resend remains disabled unless configuration is known and available. |
| Minor 4: ordinary-looking email for test order | **ADDRESSED** | Subject and body identify a test/demo order and explicitly describe the nonfiscal document as neither receipt/invoice nor proof of real payment. A focused message-content test covers these disclosures. |

## Integration observations

- The stronger historical-order guard follows root's explicit decision: an already-packed legacy row does not bypass missing progress. Existing rows are not migrated or rewritten. An operator can reopen a historical packed order through the existing manual active-status control, record the saved work, and repack; the read path remains nonmutating.
- Canonical customer association persists only the account ID, not customer names or email addresses. Unresolved retries still return the original attempt before current cart/payment/customer choices are considered.
- Adding customer lookup retains staff authorization handling and hides the private UI on role/session failure. No new credential exposure or external send path is introduced by this diff.
- The correction report records targeted regression passes. This reviewer did not independently rerun those tests; root is executing the full asset-complete AMS checks.

No requested correction remains unaddressed in this scoped review. No code changes, deployment, commit, or production mutation performed by the reviewer.
