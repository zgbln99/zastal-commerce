# Zastal Commerce OS

A modern demo storefront and shop operating system for Zastal Zielona Góra.

**Status: v0.3 — public design demo only. No real payments, shipping, or customer data.**
The website uses club imagery and a selection of photos from the existing store for evaluation, subject to club approval before production.

## Demo

- Storefront: https://zastalstore.51-15-21-164.sslip.io/
- Detailed product page: https://zastalstore.51-15-21-164.sslip.io/produkt/1
- Staff operations: https://zastalstore.51-15-21-164.sslip.io/admin → **Commerce 360°**

## Implemented functionality

**Store:** responsive landing page, current club logo and real product photos, category browser, search, sorting, full product detail pages, per-size stock availability, favorites, shopping cart, demo checkout and order confirmation.

**Inventory:** distinct products and variants (sizes), internally generated SKU/EAN-13 and QR, stock adjustment with reason, transaction-backed inventory ledger, availability checked by size at checkout. The internal EAN prefix 200 is for restricted circulation; these are not globally registered GS1 GTINs.

**Orders:** persistence, price snapshots, selected sizes, status changes, item details, order history, cancellation with stock restoration where appropriate, on-screen scanner-assisted checking, CSV export.

**DTF:** the club purchases **finished transfers** from external suppliers and applies them to blank apparel. The system supports creating transfer purchase batches, separate receipt of the delivery, availability accounting, allocating transfers to order-line production tasks, stage progression and activity audit. It does not attempt to control any DTF printing hardware or RIP software.

**Operations:** responsive admin UI (Commerce 360°), inventory by variant, DTF purchase + stock intake, order trace, production queue, barcode/QR label sheets, activity log.

**Security:** demo bearer token protected admin endpoints, HTTPS front end, server-side pricing and variant-stock checks, input validation and basic checkout rate limits. This is not production security and does not replace real user accounts, RBAC, CSRF reviews, monitoring and legal compliance.

## Repository

- `storefront/` — Next.js 16, React 19, TypeScript
- `storefront/app/produkt/[id]/` — dedicated product pages
- `storefront/app/admin/` — admin and Commerce 360
- `commerce_api.py` — Python demo API with variant stock, DTF and order workflows
- `app.py` — legacy prototype kept for historical/rollback purposes
- `scripts/sync_demo_catalog.py` — demonstration catalog migration
- `tests/test_commerce_api.py` — isolated API integration tests

## Running locally

```bash
export ZASTAL_ADMIN_TOKEN="generate-your-own-long-random-secret"
export ZASTAL_PORT=8880
python3 commerce_api.py
```

In another terminal:

```bash
cd storefront
npm ci
npm run dev
```

Run tests from the repository root:

```bash
python3 -m unittest discover -s tests -p 'test_commerce_api.py' -v
```

Never commit secrets, real customer data or the SQLite database. Deploy with a reverse proxy using HTTPS.

## AMS deployment

- Next.js: `zastal-storefront.service` on `127.0.0.1:8879`
- Commerce API: `zastal-store-api.service` on `127.0.0.1:8880`
- Nginx with automated Let's Encrypt certificate on `https://zastalstore.51-15-21-164.sslip.io`
- Persistent SQLite data file (ignored by Git) and server-only `.runtime.env`

Before deploying, back up SQLite, run tests and `npm run build`. Restart the two services and verify public API responses.

## Not yet production-ready

Still required: transactional PostgreSQL migration; granular identity, roles and permissions; size specs approved by the apparel manufacturer; genuine product stock and supplier catalog import; production cost accounting; barcode printer calibration; full backorder/returns workflow; shipping provider integrations; payment processing; fiscal documents and taxes; customer rights and accessibility compliance; real analytics; Android staff application.

No live purchases are accepted in this demonstration.
