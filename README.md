# Zastal Store

Polish fan-shop storefront and staff operations workspace for Zastal Zielona Góra.

**v0.4 — functional demonstration. Orders, payments and deliveries are test-only. No card details, personal identity or shipping addresses are collected.** Product and club photographs come from the existing catalogue and should be approved by the club before commercial use.

## Pages

- [Storefront](https://zastalstore.51-15-21-164.sslip.io/)
- [Catalogue](https://zastalstore.51-15-21-164.sslip.io/sklep): category, search, price, size, availability and sorting stored in the URL
- [Product](https://zastalstore.51-15-21-164.sslip.io/produkt/1): live price and stock for each size
- [Favorites](https://zastalstore.51-15-21-164.sslip.io/ulubione)
- [Checkout](https://zastalstore.51-15-21-164.sslip.io/zamowienie)
- [Shopping help](https://zastalstore.51-15-21-164.sslip.io/pomoc)
- [Staff workspace](https://zastalstore.51-15-21-164.sslip.io/admin)

## Shopping

A shared header, product search, favorites and editable cart work across all shopping pages. Existing saved selections retain their storage keys and are validated before use. Product photographs and Inter fonts are served locally. Missing photographs have a visible fallback.

Prices and variant availability come from `/api/catalog`. New purchases are blocked when availability cannot be verified. The API checks stock again inside the order transaction and calculates all amounts in integer groszy. Test delivery costs are pickup 0, parcel locker 1299 and courier 1499; delivery becomes free at a product subtotal of 25000.

Checkout uses a retained idempotency key and exact request snapshot. A lost response can be recovered after a reload, including when the attempted purchase exhausted the remaining stock. Reusing a key with different contents is rejected. Completing a purchase removes only the submitted quantities from the cart. Each confirmation URL contains a random token and exposes only that order and its status history.

## Staff operations

One navigation covers the overview, orders, variant inventory, DTF transfers, application queue, labels and audit history. Overview counts are derived from the loaded records; bounded order totals are labelled accordingly.

- Orders: item and delivery details, status history, cancellation with eligible stock restoration, CSV export and scanner-assisted packing that checks the exact variant and quantity.
- Inventory: size variants, stock corrections with reasons and a transaction-backed movement ledger.
- DTF: purchase **finished transfers from external suppliers**, record full or partial receipt, reserve them for order-line application tasks and progress those tasks through the application stages.
- Labels: internally generated SKU/EAN-13 and QR per variant, printable sheets and individual labels. Prefix 200 is for internal circulation; these EANs are not globally registered GS1 GTINs.
- Access: existing server-side bearer credential; staff data is fetched only after authentication. The credential is held in memory in the browser.

## Running locally

Python uses the standard library. Set a private token and run the API from the repository root:

```bash
export ZASTAL_ADMIN_TOKEN="your-own-long-random-secret"
export ZASTAL_PORT=8880
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
python3 -m unittest discover -s tests -v
node --test tests/*.test.mjs
```

Then from `storefront/`:

```bash
npx tsc --noEmit
npm run build
```

Tests cover server pricing and shipping, variant stock, rollback, checkout retries, protected receipts, saved-cart parsing, checkout recovery, cart reconciliation and scanner quantity checks. Use an isolated database for tests. Do not commit credentials or SQLite files.

## Deployment

The existing AMS deployment runs:

- `zastal-storefront.service`: Next on `127.0.0.1:8879`
- `zastal-store-api.service`: Python on `127.0.0.1:8880`
- Nginx with HTTPS at the storefront URL above

The runtime credential file and SQLite database remain outside source control. Build in an isolated release directory with its own dependency directory, back up SQLite using the SQLite backup API, preserve runtime files, install the verified source/build and restart only these two services. Verify the catalogue, storefront routes and protected endpoints afterwards.

## Scope

This demonstration does not process real payments, dispatch parcels, issue fiscal documents or collect customer addresses. Commercial launch still needs approved product and size information, actual stock and suppliers, payment/delivery integrations, customer-service and returns procedures, staff identity/permissions and applicable commercial policies. Physical label alignment needs checking on the target printer. An Android staff application is a separate future project.

`app.py` is the legacy prototype retained for historical reference. The deployed API is `commerce_api.py`; the deployed interface is `storefront/` (Next.js 16, React 19, TypeScript).
