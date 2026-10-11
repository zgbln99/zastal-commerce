# Zastal Store

Polish fan-shop storefront and staff operations workspace for Zastal Zielona Góra.

**v0.8 — prelaunch store with a versioned homepage CMS and visual editor.** Public browsing and staff operations are available. The system **does not accept new orders, registration or payments** until real integrations, verified stock, confirmed seller identity and legally reviewed sales information are in place. Previously created test orders are retained as historical records. No card details or shipping addresses are collected. Product and club photographs come from the existing catalogue and should be approved by the club before commercial use.

## Home page editing (CMS)

Open **/admin → Edytor strony**. The editor has an outline of blocks, a central live desktop/mobile preview and settings for each selected block. Use **Zapisz szkic** to keep unfinished work private and **Opublikuj** to make it live. **Historia** restores previous versions to a private draft; it does not publish without confirmation. Nine sections can be added and configured. Product imagery can also be uploaded directly in the product editor.

Implementation and safeguards are documented in [docs/CMS.md](docs/CMS.md). The frontend reads only the public published configuration via the server-side API; private drafts require an authenticated administrator session with CSRF protection. Publishing content **never** enables checkout or bypasses sales readiness checks.

## Sales launch / readiness

The administrator can use the **Uruchomienie sklepu** section to enter the legal seller name, verified NIP, contact and return address, HTTPS links to the sales regulations, privacy notice, withdrawal/returns and shipping policies. The section records club-side confirmations for branding, catalog, counted stock and the purchased DTF supply chain, and tracks technical launch blockers separately. Changes are audited. API: public `GET /api/store/status`; authenticated admin `GET/PATCH /api/admin/launch`.

The **Import magazynu** screen supports downloading an Excel-compatible `sku;stan` CSV template and uploading verified stock counts. The backend validates all SKUs and quantities before making any changes, rejects duplicate SKUs, applies updates in one SQLite transaction, recalculates product totals and records every variance in the stock ledger. The import **never** automatically confirms inventory readiness or activates checkout.

**Fail-closed:** `/api/orders` and `/api/auth/register` return HTTP 503 with code `store_prelaunch`. New sales cannot be enabled by an administrator checkbox. Payment provider, real shipping, transactional email and fiscal/commercial documentation integrations must be completed and tested before the API is changed to allow real purchases. Existing order confirmation links remain readable.

The restricted environment variable `ZASTAL_TEST_MODE=isolated-only` enables original write integration tests **only when the test database resides under the operating system temporary directory**. Never enable it on AMS production.

## Pages

- [Storefront](https://zastalstore.51-15-21-164.sslip.io/)
- [Catalogue](https://zastalstore.51-15-21-164.sslip.io/sklep): category, search, price, size, availability and sorting stored in the URL
- [Product](https://zastalstore.51-15-21-164.sslip.io/produkt/1): live price and stock for each size
- [Favorites](https://zastalstore.51-15-21-164.sslip.io/ulubione)
- [Checkout](https://zastalstore.51-15-21-164.sslip.io/zamowienie)
- [Shopping help](https://zastalstore.51-15-21-164.sslip.io/pomoc)
- [Customer account](https://zastalstore.51-15-21-164.sslip.io/konto)
- [Staff workspace](https://zastalstore.51-15-21-164.sslip.io/admin)

## Collections and storefront

The homepage is managed with a genuine section-based CMS: drag to reorder, show/hide/duplicate, edit images, headings, CTAs and merchandised products. A single editorial club-photo hero replaced the old rotating carousel. The CMS supports separate private drafts and published revisions, private responsive preview, media uploads, rollback and audited changes.

## Shopping

A shared header, product search, favorites and editable cart work across all shopping pages. Recently viewed product IDs are remembered locally in the browser only; there is no synced browsing-history account profile. Existing saved selections retain their storage keys and are validated before use. Product photographs and Inter fonts are served locally. Missing photographs have a visible fallback.

Prices and variant availability come from `/api/catalog`. The public checkout is deliberately disabled during prelaunch. Legacy historical integration tests simulate pickup, parcel locker and courier prices but **none of these are published shipping offers**. The public basket no longer displays a fictional free-shipping threshold. The API continues to validate stock and calculate amounts in integer groszy within isolated workflow tests.

Checkout uses a retained idempotency key and exact request snapshot. A lost response can be recovered after a reload, including when the attempted purchase exhausted the remaining stock. Reusing a key with different contents is rejected. Completing a purchase removes only the submitted quantities from the cart. Each confirmation URL contains a random token and exposes only that order and its status history.

## Accounts and customizable merchandise

Customer registration and login use opaque Secure/HttpOnly cookies, server-side role checks and CSRF validation. Customers can edit their display name, change their password, revoke other sessions and see only their own orders. Guest orders can be attached using their private confirmation token. Checkout records its account identity in the retained request to avoid attaching a recovered attempt to a different account.

There is no email provider. Registration and recovery show a high-entropy personal recovery key once; a used key is replaced and other sessions are revoked. Customers must save that key. The administrator identifier is `admin`; the existing server credential bootstraps its password once, then passwords are managed on the account screen. The previous Bearer route no longer grants access. Never publish the runtime credential.

The product form creates live catalogue entries, variants and internal EANs. It supports an image, short description, optional/required personalization and an integer-groszy print fee. Buyers choose an active player or enter a surname (1–20 letters/punctuation) and a one/two-digit number, including 0 or 00. The initial 12-player roster was checked at https://basketzg.pl/players on 2026-10-10 and is editable in the panel. There is no automatic claim that the roster remains current after that date.

Cart lines distinguish print choices while sharing size stock. Server-calculated names, numbers and fees are saved with each order and shown in confirmations, customer history, staff orders and the DTF queue. Retries retain the original order and charges after catalogue or roster changes. One existing hoodie is currently configurable for surname/number printing; other products are not automatically treated as customizable. When adding true game jerseys, first upload verified product photography, size specifications, approved roster options and actual decoration costs.

## Staff operations

One navigation covers the overview, products, players, customers, orders, variant inventory, DTF transfers, application queue, labels, account settings and audit history. Overview counts are derived from the loaded records; bounded order totals are labelled accordingly.

- Orders: item and delivery details, status history, cancellation with eligible stock restoration, CSV export and scanner-assisted packing that checks the exact variant and quantity.
- Inventory: size variants, stock corrections with reasons and a transaction-backed movement ledger.
- DTF: purchase **finished transfers from external suppliers**, record full or partial receipt, reserve them for order-line application tasks and progress those tasks through the application stages.
- Labels: internally generated SKU/EAN-13 and QR per variant, printable sheets and individual labels. Prefix 200 is for internal circulation; these EANs are not globally registered GS1 GTINs.
- Customers: real registered accounts, order history and blocking/unblocking; blocking revokes active sessions. Staff data is fetched only for an authenticated administrator.

## Running locally

Python uses the standard library. Set a private token and run the API from the repository root:

```bash
export ZASTAL_ADMIN_TOKEN="your-own-long-random-secret"
export ZASTAL_PORT=8880
export ZASTAL_SITE_ORIGIN="https://your-store.example"
python3 commerce_api.py
```

In another terminal:

```bash
cd storefront
npm ci
npm run dev
```

The development storefront is at `http://127.0.0.1:8878`. Its `/api/*` requests are proxied to the Python API at port 8880. `ZASTAL_DB` can point to a separate SQLite database; the default database is created locally.

## Verification

From the repository root:

```bash
ZASTAL_TEST_MODE=isolated-only python3 -m unittest discover -s tests -v
node --test tests/*.test.mjs
```

Then from `storefront/`:

```bash
npx tsc --noEmit
npm run build
```

Tests cover cookie accounts/roles/CSRF/session revocation, private order ownership, product/roster validation, authoritative print fees, immutable print snapshots, shared variant stock, rollback, checkout retries, protected receipts, saved-cart parsing, checkout recovery, cart reconciliation and scanner quantity checks. Use an isolated database for tests. Do not commit credentials or SQLite files.

## Deployment

The existing AMS deployment runs:

- `zastal-storefront.service`: Next on `127.0.0.1:8879`
- `zastal-store-api.service`: Python on `127.0.0.1:8880`
- Nginx with HTTPS at the storefront URL above

The runtime credential file and SQLite database remain outside source control. Build in an isolated release directory with its own dependency directory, back up SQLite using the SQLite backup API, preserve runtime files, install the verified source/build and restart only these two services. Verify the catalogue, storefront routes and protected endpoints afterwards.

## Scope

This is a **prelaunch environment**, not an active e-commerce merchant checkout. The storefront cannot process real payments, dispatch parcels, issue fiscal documents or collect customer addresses. Commercial launch still needs approved product and size information, actual stock and suppliers, payment/delivery integrations, customer-service and returns procedures, email delivery/verification, additional staff roles and applicable commercial policies. Physical label alignment needs checking on the target printer. An Android staff application is a separate future project.

`app.py` is the legacy prototype retained for historical reference. The deployed API is `commerce_api.py`; the deployed interface is `storefront/` (Next.js 16, React 19, TypeScript).
