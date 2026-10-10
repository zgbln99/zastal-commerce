# Zastal Store Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deploy a product-first storefront with genuine customer and administrator accounts.

**Architecture:** Add isolated authentication/session functions around the existing transactional Python API. A shared React AuthProvider serves both customer and administrator shells. Preserve the current data and operational DTF workflow.

**Tech Stack:** Python stdlib, SQLite, Next.js 16.4, React 19.2, TypeScript, existing Lucide icons.

**Spec:** docs/superpowers/specs/2026-10-10-customer-accounts-design.md

## Global Constraints

- No new dependencies; no live payments, shipping or email sending.
- Cookie __Host-zastal_session: Secure, HttpOnly, SameSite=Lax, Path=/.
- Password scrypt N=16384,r=8,p=5,dklen=32; random 16-byte salt; 12–128 chars.
- Sessions: anonymous 1 hour, customer 7 days, admin 8 hours.
- Bootstrap administrator identifier admin uses existing server-only env credential once; remove Bearer admin authentication.
- Preserve all orders, product variants, inventory and existing purchased-transfer DTF workflow.
- Polish plain copy; no invented reviews, popularity, promotions or sales data.
- Preserve the existing public AMS deployment and external GitHub repository.

## Review Focus

- Customer A requests customer B's order: no disclosure, even by known id.
- Session expires or another account logs in during a pending checkout: exact attempt retained, correct account required.
- CSRF token is stale following a password/login rotation: mutation fails safely and UI can refresh session.
- Administrator changes bootstrap password and service restarts: old env credential must not regain access.
- Blocking a customer with an open tab: session becomes invalid and private data clears on the next request.

---

### Task 1: Server accounts and ownership

**Files:** Create commerce_auth.py, tests/test_accounts.py, tests/http_client.py; modify commerce_api.py and existing Python test clients.

**Interfaces:** Produces the exact API contract in the spec. Auth module produces public_user(row), init_schema(connection, bootstrap_secret), session(handler, connection, create=False), dispatch(handler, path, connection), and AuthError(status,message,code). Handler.request_user holds the validated user; Handler.request_session holds its session. respond supports repeated Set-Cookie via response_headers.

- [x] Write integration tests for real registration/login, private cookies, no hashes in responses, role rejection, missing CSRF, logout, reset key single-use, password revocation, unique case-folded email, one-time bootstrap, scoped orders, guest claiming, price edits, blocking, and checkout account snapshot.
- [x] Run `python3 -m unittest discover -s tests -p test_accounts.py -v`; expected failures because new routes do not exist.
- [x] Implement schema/session/auth module and hook routing/authorization/ownership into commerce_api.py. Update legacy test clients to login through the public auth contract; do not retain a permanent bearer bypass.
- [x] Run `python3 -m unittest discover -s tests -v`; expect all new and existing tests passing.
- [x] Commit server accounts, tests, spec and plan. Record bootstrap/migration/security verification in progress.

### Task 2: Customer account and checkout

**Files:** Create storefront/components/AuthProvider.tsx, AuthForm.tsx, AccountSecurity.tsx, storefront/app/konto/page.tsx, AccountClient.tsx, account.css; modify CommerceRoot.tsx, StoreShell.tsx, CheckoutClient.tsx, checkout.mjs/d.mts, tests/checkout-recovery.test.mjs and help privacy copy.

**Interfaces:** Auth context produces user:User|null, loading:boolean, csrf token in memory, request<T>(path,init):Promise<T>, refresh():Promise<Session>, logout():Promise<void>; account mutations apply returned sessions through request. Existing checkout helpers accept/retain account_id:number|null, optional account id as sixth resolveCheckoutAttempt argument. AuthForm props admin?:boolean, onSuccess?; AccountSecurity uses AuthProvider for account operations.

- [x] Add a checkout recovery test asserting retained customer id across cart/delivery/account changes and safe reading of older guest attempts. Run `node --test tests/checkout-recovery.test.mjs`; expect FAIL on missing identity snapshot.
- [x] Implement snapshot helper, shared auth provider/forms, order history/detail, profile and security flows; preserve pending attempt when identity differs. Update truthful account/privacy copy.
- [x] Run `node --test tests/*.test.mjs`; expect all tests passing. TypeScript/build performed in Task 4 after all UI changes.
- [x] Commit account and checkout UI. Record user flows and error handling.

### Task 3: Product-first storefront and Shopify-style administration

**Files:** Modify storefront/app/page.tsx, globals.css, StoreShell.tsx, StoreProvider.tsx, ProductCard.tsx; modify admin/page.tsx, Operations.tsx and styles; create admin/Customers.tsx, Products.tsx.

**Interfaces:** Consumes AuthProvider from Task 2; all admin operations use request rather than bearer token. Products endpoint uses integer prices; admin list snapshots remain parent-owned. Customers endpoints expose only administrator-authorized identity and own-order statistics.

- [x] Replace the large marketing hero with a compact merchandise/collection composition and prominent product grid; use existing real photographs and neutral clear shopping copy.
- [x] Add account link and conventional search/categories/header/footer; update live product name merging.
- [x] Replace admin token form with AuthForm, show signed-in identity, add Products, Customers and Account views. Preserve existing DTF/packing/inventory behavior using shared auth requests.
- [x] Run full Python and JS suites; expect PASS. Review table empty/error/loading states and keyboard/responsive design without implementation-mirroring tests.
- [x] Commit visual and admin changes.

### Task 4: Review, build and deployment

**Files:** README.md, package versions, review/progress notes; existing public deployment and GitHub main.

**Interfaces:** Deploys verified source over existing services, retaining DB and runtime env. Configures explicit existing site Origin. GitHub ref update requires expected current SHA; never force.

- [x] Run local full suites and remote isolated TypeScript/Next production build; expect PASS.
- [x] Request one fresh whole-change review against spec, diff and Review Focus. Fix material findings with reproducing tests first; rerun appropriate suites.
- [x] Back up current database/source/build, migrate additively, install built assets and restart existing API/store services. Verify database integrity/counts/stock match pre-deploy values and authenticated APIs on an isolated fixture.
- [x] Verify live public pages/login/registration layout, product/cart behavior and responsive widths. Don't expose credentials or test orders in user data.
- [x] Update GitHub using lease, reconcile server source and return existing public link with concise account instructions and test-payment limitation.


### Task 5 (added user scope): Jersey personalization and product creation

**Files:** commerce_personalization.py, commerce_api.py, tests/test_personalization.py;
commerce.mjs/d.mts, checkout helpers/tests, StoreProvider, PurchaseControls, product
routes, cart/checkout/account displays; admin Products/Players forms.

**Interfaces:** Exact fields and endpoints in the spec extension above.

- [x] Backend owner: write and observe failing HTTP tests for product creation,
roster seed/edit, custom/player prints, invalid input rollback, authoritative fee,
snapshots and idempotence; implement API and rerun full Python suite.
- [x] Frontend owner: write and observe failing cart tests for distinct prints,
combined variant availability, persisted custom products and exact retry identity;
implement dynamic catalog/products and print selectors/displays; rerun full JS suite.
- [x] Root: add product create/edit flags/fee and editable roster to administrator UI.
- [x] Root: integrate, type-check, build, fresh review and deploy all added scope with Task 4.

Execution adjustment: use dispatching-parallel-agents for the two file-separated
personalization domains while root completes existing accounts/admin UI. Contracts
are fixed above; backend and frontend owners do not edit the root-owned admin forms.
