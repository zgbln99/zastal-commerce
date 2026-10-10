# Whole-change review — 10 October 2026

A fresh read-only review compared the completed implementation with the professional-store spec and baseline snapshot `085c94f` (server baseline `2431003`). It checked storage hydration, API availability, size and combined quantity limits, idempotent checkout, protected receipts and staff workflows.

Two P2 findings were verified and resolved before deployment:

1. A lost successful checkout response followed by a stock refresh could disable the retry when the purchased variant sold out. The checkout now restores and replays the exact request/key in a recovery state, independent of current stock and later cart changes. This state survives a page reload. A new purchase still requires current availability.
2. Unconditional cart clearing after checkout could erase selections added while the request was pending. Completion now subtracts only the submitted quantities through an atomic state update and retains other variants and additional quantities.

Each fix has a meaningful test observed failing before implementation and passing afterwards. The final isolated server run passed 14 Node tests, 10 Python integration tests, TypeScript checking and the Next production build.

The initial build failure was traced to a dependency symlink outside Turbopack's project root. Copying the existing dependencies into the isolated release directory resolved it without changing application dependencies.

The reviewer found no additional material issue within the scope. Rendered UI, proxy behavior and physical label printing were outside the review's verification; deployment checks and browser inspection are tracked separately. Physical printer calibration remains an explicit demonstration limitation.

The mobile browser check subsequently reproduced a lost first size click: focusing the product frame started a foreground stock refresh, disabling the button between pointer focus and its click. Focus revalidation now runs in the background while previously verified data remains visible. An explicit refresh still shows loading; a failed request still blocks purchasing. The server always checks stock in the order transaction. The same first-click browser check passed after deployment: size M stayed selected and was added to the mobile cart.

Live verification passed for home, catalogue, product, favorites, help, checkout and staff sign-in routes; missing products returned 404 and unauthorized staff/receipt requests were denied. A browser checkout recorded a single order with product 2, size M, quantity 1 and parcel-locker delivery, totalling 11199 groszy. Cancelling this test order restored total variant stock to 374. The protected receipt displayed both status events. Existing two orders, 12 products and 48 variants were retained.

Rendered browser checks covered desktop and 390/768-pixel iframe viewports, including menu, mobile filters, product/variant selection, cart and checkout. The phone pages had matching document and content widths (375 pixels after the scrollbar) with no horizontal overflow. The staff sign-in view was inspected; authenticated staff UI was reviewed in code and through API/tests, without entering credentials through low-level browser automation.
