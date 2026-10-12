# Zastal Store — continuation: POS, accounts, email and homepage

Continue the user's authorized AMS implementation. Preserve existing products, variants, stock, orders, accounts, gallery revisions, CMS drafts/publication and all session, CSRF, upload and sales-readiness protections. Deploy to AMS863260 and synchronize zgbln99/zastal-commerce.

## Staff operations

Add a staff-only POS with product search/barcode lookup, size selection, existing surname/number/player personalization, separate lines for different prints, quantities, cash/external-terminal payment confirmation and customer association. Prices and print fees are calculated by the server. A unique sale key makes retries return the original sale. Stock and movements are written in one transaction. Until live selling is configured, POS records explicitly labelled test sales; public checkout remains blocked.

Add persistent per-order, per-line picked/printed/checked counts. Same-variant shirts with different prints remain distinct. Scanning a SKU/EAN/QR confirms the selected line and one unit. Progress uses revision checks; invalid quantities, cancelled/closed orders and incomplete handover are rejected. The work queue shows picking, printing, quality and ready-to-handover work. Existing purchased DTF batch reservation remains authoritative and compatible.

## Customer accounts and email

Registration works independently from checkout readiness. Retain current password hashing, secure cookies, rate limits, CSRF, personal recovery keys and role boundaries. Add verification and password reset by email with hashed, expiring, single-use tokens and password/session revocation. Reset requests do not disclose account existence. Email delivery uses a durable outbox, SMTP TLS, bounded retries and claim leases. SMTP secrets stay in server environment, never the browser/repository. Admin sees configuration status and outbox with retry controls. Without SMTP, UI states that mail is not configured; do not claim delivery.

## Storefront

Replace the single hero with a restrained editorial carousel: current campaign retained as first slide, optional editable additional slides, product imagery visibly marked if illustrative, arrows, explicit pause, swipe and keyboard controls. Pause for hidden document, focus, hover, open store modal and reduced-motion preference. Preserve private CMS drafts and publication revision semantics. Remove public admin navigation; customer account and registration remain discoverable. Admin stays directly accessible at /admin and excluded from search indexing.

## Acceptance

Meaningful tests cover transactional stock rollback, retry identity, line progress conflicts and print checks, auth role/CSRF boundaries, registration independent of checkout, email token reuse/expiry/session revocation and outbox failures. Run full Python/Node suites, TypeScript and production build. Verify public desktop/mobile, private staff sections and data preservation using a predeployment database backup. No fabricated model/lifestyle imagery or credentials.
