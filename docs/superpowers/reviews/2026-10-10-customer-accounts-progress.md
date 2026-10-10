# SDD ledger — plan: docs/superpowers/plans/2026-10-10-customer-accounts.md

Baseline: local b58c730 checkpoint exactly corresponds to deployed GitHub 473c0ec source; 14 JS and 10 Python tests passed. Working branch feature/customer-admin-accounts is isolated from server and GitHub main.

Pre-flight: Task 1 Session/User and endpoints feed Task 2 AuthProvider; consistent. Task 2 request wrapper feeds Task 3 all admin requests; consistent. Task 1 account_id ownership feeds Task 2 checkout snapshot; consistent.

Implementation is authorized by the user's action request and established deployment authorization; developer autonomy rules take precedence over lower-priority repeated skill approval stages.

Task 1: complete (c312fbd), 25/25 Python integration tests PASS. Bootstrap is one-time and old Bearer denied. Task 2 checkout snapshot test observed RED (undefined != 42), then GREEN; 15/15 JS suite PASS.

Task 5 API: repaired an interrupted duplicated GET mutation block, 15 personalization integration tests covering product creation, official roster/edit, server pricing, retry snapshots, shared stock rollback and DTF queue snapshots beyond 300 newer orders. Root added RED/GREEN malformed non-ASCII CSRF header regression. Integrated Python suite 41/41 PASS (26.267s), current JS29/29 PASS. Admin forms create/edit products, flags/fees and roster; visual/build QA pending.

Task 2/3/5 storefront: complete in current source. Dynamic product IDs, selectors, line identity/aggregate stock, fee display and immutable retry snapshots are wired across cart/checkout/receipt/customer history; JS29/29 fresh PASS. Product creation/metadata/nadruk, roster CRUD, customer block/unblock and account settings consume role/CSRF API. Independent review and production TypeScript/build now running before deployment.

Fresh whole-change review found two Important issues: password verification/session creation race and listing/filtering of a required paid print at base price. Both verified and fixed with RED/GREEN regressions. Login rechecks active/hash under BEGIN IMMEDIATE; account writes recheck active/session/hash under the write lock after hashing. Shared productDisplayPrice includes required fee in card/search/filter/sort. Reviewer rechecked and reports no remaining Critical/Important findings. Root final full suites: Python42/42 PASS (30.890s), JS32/32 PASS. Initial isolated TypeScript/Next build passed; final rebuild after fixes pending. Integration choice is existing authorized AMS deployment and GitHub main update; no repeated permission menu needed under higher-priority user/developer authorization.

Final isolated AMS verification after both fixes: Python42/42 PASS (45.855s), TypeScript noEmit exit0, Next production build exit0. Build ID NUEVXCB6WNWaV5g0zfkIw. All 90 tracked source files verified by SHA-256 before activation.

v0.5 deployed to the existing HTTPS origin. Backup: /var/lib/sentinelx/uploads/zastal-backups/accounts-20261011-v05-1791673286 (source, build, SQLite database and private runtime environment). Additive migration preserved every pre-existing table's selected-column content hash; 4 orders, 12 products, 48 variants and total stock373 unchanged. SQLite integrity and foreign-key checks PASS. One administrator bootstrapped; 12 verified roster entries seeded. Both existing services active; health v0.5. No test customers, products or orders added to the live database.

Native HTTPS checks PASS: anonymous session, admin login/logout, secure cookie flags, products/players/customers/orders read endpoints, anonymous denial and denial of the removed Bearer bypass. Live data still 4 orders/12 products/48 variants/stock373, one administrator, no customers. Secrets and session tokens stayed inside the host.

Browser QA PASS: real product prices and photographs load without broken images; desktop home, customer login/register/recovery, administrator login; mobile390 and tablet768 without document overflow. Selected product1 sizeL, cart99 PLN, quantity2=198 PLN, back to1=99 PLN, removal leaves empty cart. No order submitted. Public screenshot captured and saved. Temporary layout helper is excluded from source and removed after QA. GitHub publication remains the final integration step.
