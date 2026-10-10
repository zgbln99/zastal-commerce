# Zastal Store Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for the owner and dispatching-parallel-agents for the independent operations UI task.

**Goal:** Deliver a professional, coherent fan shop and usable operations panel at the existing AMS URL.
**Architecture:** Keep Next/React/TypeScript and the existing Python SQLite API. Add shared storefront components and a single store provider; improve checkout with protected receipts and idempotency. Consolidate operations navigation around the existing API.
**Tech Stack:** Next 16, React 19, TypeScript, lucide-react, Python stdlib, SQLite, existing jsbarcode and qrcode.react.
**Spec:** docs/superpowers/specs/2026-10-10-professional-store.md

## Global Constraints
- Polish, mixed case, no decorative filler, no fabricated product measurements or business statistics.
- Preserve URL, products, orders, stock and server-only admin credential.
- DTF transfers are bought finished from external suppliers.
- Checkout, payment and delivery remain explicitly simulations. Collect no personal identity or address.
- All money is integer groszy. Shipping: pickup 0, locker 1299, courier 1499, free from 25000.

## Review Focus
- Corrupt local storage must not crash or erase a valid cart during hydration.
- API outage must not enable purchase with invented inventory.
- Sold-out size and combined cart quantities must block overselling.
- Retry of a successful checkout must not create a second order.
- Receipt URLs and admin data must not be exposed without their respective credentials.

### Task 1: Shared storefront state and shell
**Files:** storefront/lib/commerce.mjs, storefront/lib/commerce.d.mts, storefront/components/StoreProvider.tsx, StoreShell.tsx, ProductCard.tsx, Modal.tsx; storefront/app/globals.css; tests/store-state.test.mjs.
**Interfaces:** CartLine {id:number,size:string,quantity:number}; Variant {id:number,product_id:number,size:string,sku:string,ean:string,stock:number}; provider supplies authoritative products, stock loading/error, cart, favorites, add/update/remove, refresh and dialogs.
- [x] Write tests for parsing corrupt/unknown/invalid cart data, merging duplicate variant lines and shipping threshold; run node --test tests/store-state.test.mjs to see failures.
- [x] Implement pure helpers and provider; retain v2 storage keys and persist only after hydration.
- [x] Build responsive header, real result search, accessible dialog behavior, cart drawer, product cards and useful footer.
- [x] Run Node tests and TypeScript check; inspect output.

### Task 2: Complete shopping pages and checkout API
**Files:** storefront/app/page.tsx, sklep/ShopClient.tsx, produkt/[id]/ProductDetail.tsx, ulubione/page.tsx, zamowienie/page.tsx, pomoc/page.tsx; commerce_api.py; tests/test_checkout.py.
**Interfaces:** POST orders accepts items, fulfillment and idempotency_key; responds {id,total,tracking_token}; GET receipt requires token. Fulfillment codes odbior/paczkomat/kurier.
- [x] Add integration tests for idempotent retry, conflicting reuse, protected receipt, server shipping/pricing and rollback; run unittest to see the expected failures.
- [x] Add safe migration and server receipt/idempotency implementation; rerun the full Python suite.
- [x] Implement home, URL-based filters, variant-aware product, wishlist, help and test checkout with protected confirmation.
- [x] Typecheck/build all routes, verify responsive styles and preserve product-not-found handling.

### Task 3: Operations workspace (independent UI task)
**Files:** storefront/app/admin/page.tsx, Operations.tsx, admin.css, operations.css.
**Interfaces:** Existing /api/admin endpoints are unchanged. New Operations props expose controlled active tab and hide duplicate internal navigation; root admin owns sidebar and dashboard.
- [x] Read current operations and keep every working inventory/DTF/order/label action.
- [x] Consolidate navigation and replace decorative admin styling with a clean, readable workspace.
- [x] Derive dashboard metrics from API records; label all demo totals accurately, fix scanner handling if quantities are not checked.
- [x] Typecheck with final storefront and verify auth failure states.

### Task 4: Review, deploy, verify
**Files:** README.md; release archive and remote isolated build (ignored transient outputs).
- [x] Run Node and full Python tests and Next production build.
- [x] Request one fresh whole-change review, fix material issues and rerun affected verification.
- [x] Back up SQLite, require unchanged baseline source or reconcile changes, deploy app services and check HTTP/API routes.
- [x] Commit/push the verified code and docs to the existing GitHub repository; update README status and actual limitations.
