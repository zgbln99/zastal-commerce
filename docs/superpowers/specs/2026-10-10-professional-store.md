# Zastal Store — professional rebuild

## Outcome
Rebuild the existing AMS storefront and operations panel into a consistent, complete Polish fan shop. Preserve the public URL, product identities, existing order data, stock ledger and purchased DTF transfer workflow. The user's direction is professional, product led, with natural copy and fewer decorative slogans.

## Experience
Use white and warm gray surfaces, forest green actions, restrained yellow details, real existing product and club photos, readable mixed case typography, and consistent spacing. Remove oversized repeated slogans, stars, fabricated counters, English marketing filler and inert newsletter actions. One clear demo notice explains that payments and shipments are simulations.

The storefront has a shared header, search with product results, category navigation, favorites, cart drawer and footer. Home has a club photo hero, featured product, category links, product recommendations and practical shopping help. Catalog supports category, search, price, size, availability and sorting with URL state, clear reset, counts and mobile filters. Product pages show image, authoritative price and variant stock, size selection, quantity, real product details, delivery explanation and related products. Do not invent manufacturer specifications or size measurements.

One shared provider hydrates the existing local cart and favorites before persisting. Parse saved values defensively; filter unknown products, invalid sizes and invalid quantities. All pages use the same variants and price data fetched from /api/catalog. Show a stock/price verification error when the service is unavailable; never invent availability. Price snapshots at checkout come only from the server.

Add /ulubione, /zamowienie and /pomoc. Checkout presents line items, delivery simulations (pickup 0, parcel locker 1299, courier 1499 groszy, shipping free from 25000 groszy), and a clear test-only submission without collecting personal identity or addresses. A successful order has a protected confirmation URL and status history. Do not integrate or claim real payment, delivery or newsletter services.

## API behavior
Retain existing API compatibility. Add optional fulfillment and idempotency_key to POST /api/orders. Validate method and key; calculate shipping on the server. Retrying an identical key must return the same order without a second stock reduction. Reusing a key for different contents returns 409. Failed checkout rolls back all stock mutations. Add receipt metadata with random tracking token; public GET /api/orders/{id}?token=... requires the token and only returns that order's receipt and events. Existing anonymous legacy POST remains test-only.

## Operations
Replace duplicated legacy and Commerce 360 screens with one sidebar and operational workspace: dashboard, orders, variant inventory, DTF purchases, application queue, labels and history. Preserve working order details, stock adjustments with reasons, transfer intake, task assignment/status, scanner checks, exports and actual variant EAN/QR printing. Dashboard statistics derive from persisted data. DTF means externally purchased finished transfers applied to blank garments; no printer hardware control. EAN prefix 200 is internal circulation, not a registered global GTIN.

## Delivery and verification
Work on a local isolated snapshot of server commit 2431003. Tests use isolated SQLite data and must cover server pricing, variant stock, transaction rollback, idempotent checkout and protected tracking. Test cart parsing and shipping rules with Node's built-in test runner. Build and typecheck the Next application on an isolated AMS release directory with existing dependencies, back up the persistent database, deploy only this app, verify HTTP routes and APIs, and commit/push code to zgbln99/zastal-commerce. Preserve the current admin credential without exposing it.
