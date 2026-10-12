# Store operations implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Independent, disjoint modules may use dispatching-parallel-agents. Follow test-first changes.

**Goal:** Complete POS, persistent fulfillment, registration/email and a polished editable carousel on the existing AMS store.

**Architecture:** Add independent standard-library SQLite modules for operations and email. Root integrates them in commerce_api; independent UI tasks consume specified endpoints. Preserve existing schema and CMS revision semantics.

**Tech Stack:** Python standard library, SQLite, Next.js 16, React 19, TypeScript.

**Spec:** docs/superpowers/specs/2026-10-12-store-operations-design.md

## Global constraints

- Preserve existing data and security. Public checkout remains prelaunch.
- No secrets in code, output or browser. SMTP configuration comes from environment.
- Server calculates sale totals and commits stock atomically. No stock mutation on invalid/repeated requests.
- Do not fabricate model imagery. Preserve CMS drafts and published content.
- Worker tasks own disjoint files and do not spawn children or deploy.

## Review focus

- A repeated sale request with different contents must return conflict, not charge/reserve again.
- Same variant with different prints must require distinct progress confirmation.
- Concurrent progress updates must reject stale revisions.
- Old reset tokens must not survive a password change or reset.
- Pending mail must not appear sent when SMTP is absent or fails.

### Task 1: Operations backend

Create commerce_ops.py and tests/test_operations.py. Interfaces: init_schema(c), create_sale(c,data,actor_id), queue(c), detail(c,order_id), update_line(c,order_id,data,actor_id), complete(c,order_id,data,actor_id). OpsError carries status and code. All mutations run under BEGIN IMMEDIATE in API. GET /api/admin/fulfillment returns queue; GET /api/admin/fulfillment/:id returns detail {id,status,revision,items:[{...order_line,line_index,picked_qty,printed_qty,checked_qty}],...}. POST /api/admin/pos/sales accepts {items:[{id,size,quantity,personalization?}],idempotency_key,payment_method:'cash'|'terminal',payment_confirmed:true,customer_id?:number}. PATCH /api/admin/fulfillment/:id accepts {revision,line_index,action:'pick'|'print'|'check',quantity:1,code?:string}. POST /api/admin/fulfillment/:id/complete accepts {revision,action:'pack'|'handover'}. Response sale {id,total,items,tracking_token,demo:true,replayed?:boolean}. Completion handover adds status wydane. Preserve legacy schemas, reserve variant stock once, audit, validate print snapshots and enforce closed orders. Test first rollback, same key conflict/replay, stale revisions, scanner mismatch, repeated quantities and readiness.

### Task 2: Email backend

Create commerce_email.py, tools/email_worker.py and tests/test_email.py; modify commerce_auth.py only for registration notification/public verification flag/password changes invalidating tokens. Root integrates schema/HTTP dispatch. Interfaces init_schema(c), configuration() -> {configured,host,port,from_address,tls,missing:[str]}, admin_status(c) -> {configuration,counts,messages}, dispatch(handler,path,c)->bool, enqueue_order(c,order_id,kind='order_created'), process_outbox(connect,limit=10). Routes POST /api/auth/password-reset/request {email}; POST /api/auth/password-reset/confirm {token,password}; POST /api/auth/email/verify {token}; POST /api/account/email/verification {}; GET /api/admin/email; POST /api/admin/email/retry {id}. Admin handlers require role/CSRF, auth routes require CSRF; all expiring tokens are single use and hashed. queue_verification(c,user) called by registration. SMTP uses ZASTAL_SMTP_HOST/PORT/USERNAME/PASSWORD/FROM/TLS ('starttls' or 'ssl') and ZASTAL_SITE_ORIGIN. Worker delivery is separate from HTTP, leases and retries persist; no external email during tests. Test first expiry/reuse, stale credentials, nonenumeration, no SMTP and delivery failure.

### Task 3: Staff interface

Create storefront/app/admin/POS.tsx, Fulfillment.tsx, EmailCenter.tsx, pos.css and any pure cart helper/test. Modify admin/page.tsx and OperationsTab in admin/Operations.tsx only for navigation/rendering and closed status display. Consume Task 1/2 exact endpoints; use existing auth.request, store catalog and personalization controls. Two-column searchable POS with barcode, variants/prints, basket and explicit cash/terminal confirmation. Persist sale key across ambiguous network errors and prevent changed cart being sent under same key. Saved fulfillment list/detail shows selected line print labels, scanner and stage buttons, revision conflicts refetch. Add print-friendly nonfiscal sale summary/work ticket. Email config status/outbox and retries. Polish responsive desktop/mobile. Test pure basket/retry helpers; TypeScript verification.

### Task 4: CMS carousel

Modify StoreHero.tsx, flagship-hero.css, home-layout.ts, HomeEditor.tsx, commerce_cms.py and related tests. Use existing first hero settings with optional numbered additional slide fields and options for interval/autoplay; preserve old configs and revisions. Each slide has image/title/description/CTA, image_alt and image_illustrative. First slide always remains. Add responsive editorial layout, controls, keyboard/swipe, pauses including document visibility/store modal/reduced motion. Test CMS acceptance/backward compatibility and carousel helpers.

### Task 5: API and customer integration

Modify commerce_api.py, commerce_launch.py, StoreShell.tsx, AuthForm.tsx, account pages and add email token route. Root owns these files. Integrate ops/mail initialization, routes, exceptions and queue on order status changes. Remove register from checkout gate; expose registration_enabled=true separately. Hide public admin links, add registration tab/CTA, verify/reset token form, account verification badge/resend and email admin route. Maintain secure auth boundaries. Test HTTP integration; update old tests asserting registration forbidden.

### Task 6: Verification and release

Run Python suite, Node suite, TypeScript and isolated production build. Review combined diff. Back up live SQLite consistently and media state; verify head unchanged; deploy checked source/build with rollback. Start periodic email worker without SMTP delivery when unconfigured. Verify public HTTPS desktop/mobile and authenticated POS/account/CMS views; rollback/cancel test transactions and remove disposable test identities. Commit/push to main and record evidence.
