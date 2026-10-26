# Zastal Store — Your Next Store UI adaptation

Upstream: https://github.com/yournextstore/yournextstore (MIT license; see docs/licenses/YOUR_NEXT_STORE-MIT.txt).

## Scope

This branch ports the **visual storefront pattern** of Your Next Store (clean light surfaces, restrained hero, rounded CTAs, centered compact navigation, spacious collection/product grids) to the existing Zastal Store. It does not replace the application's commerce engine, authentication, CMS or staff workspace.

- `storefront/components/YnsHeader.tsx`: Your Next Store's compact centered navigation adapted to Polish links, existing cart drawers, account, favorites and search.
- `storefront/components/YnsHero.tsx`: Your Next Store's minimal editorial hero adapted to the existing published Zastal CMS content and image sources. Displays the first CMS slide, so the page opens without an automatic carousel.
- `storefront/app/yns-theme.css`: customer-facing responsive visual layer. Scope under `.store-site` / `.yns-*` to protect the admin workspace.
- Existing `HomeCanvas`, `ProductCard`, catalog, product personalization and customer pages keep their current logic.

## Deliberate boundaries

Your Next Store's `commerce-kit` needs a YNS_API_KEY and targets the YNS managed backend; substituting it would break local catalog, inventory, POS and customer accounts. This integration uses **no YNS hosted services, keys or Stripe checkout**. Public checkout remains disabled until real payment and shipping systems are tested and switched on separately. No test-only sale is made public.

The retained CMS still supports sections, media, published revisions and previews. The `hero` section now shows one primary slide; extra saved slides remain stored and can be reintroduced via a future CMS setting.

## Validation before merging

From `storefront` run `npm ci && npm run build`, then exercise:
1. Homepage with both published CMS content and backend unavailable.
2. Catalog searching, filtering, mobile filters, product detail and personalized variants.
3. Cart drawer, favorites, account login, search dialog and mobile navigation.
4. Admin CMS editing/publishing, POS, stock, orders; verify unaffected layouts.
5. Narrow mobile viewport, keyboard navigation, lazy images, empty and illustrative media.

Production has not been updated by this branch.
