# Zastal Store — design and product standards

## Direction

The shop must feel like a **real club merchandise brand from Zielona Góra**.
The references are a carefully art-directed sports retail flagship and a useful
e-commerce operation, not a site-builder template, AI-generated campaign or
generic SaaS dashboard.

The four pillars are: **authentic club photography**, **real merchandise as hero**,
**typography with strong hierarchy**, and **quiet, dependable shopping behavior**.

## Visual identity

| Token | Value | Role |
|---|---|---|
| Deep evergreen | `#103D2D` | Brand anchor, primary actions, official matchday feel |
| Forest | `#154633` | Navigational accents, dark panels |
| Ink | `#172820` | Typography and neutral UI |
| Off-white | `#F8F9F6` | Open editorial space |
| Stone | `#EEEAE2` | Warm background in the personalization studio |
| Court sage | `#DDE6DC` | Product presentation / limited geometric drawing |
| Signal yellow | `#D9E784` | **Restricted** signal: active state or single micro-accent |

Logo: use `/assets/zastal-logo.svg`. It must not be reconstructed as type,
re-colored randomly or replaced with a stylized AI-generated glyph.
The `1946` motif and subtle basketball-court geometry are secondary editorial
assets and must not compete with the actual merchandise or club crest.

Type: Inter with Polish glyphs, already served locally. Use purposeful weight
contrast (720–780 display / 630–700 controls / 400–500 body). Avoid multiple
novelty font families, exaggerated condensed typography and random ALL CAPS.
A small running number such as `01 / KATEGORIE` helps form a club catalog
without resorting to ornamental badges.

## Composition

- Start with authentic supporter photo: big image, stable crop, clear copy field.
- Product photography has space to breathe; use `object-fit:contain`.
- Prefer asymmetric **editorial** features to repetitive boxes.
- Section order: hero → categories → real customization capability →
  merchandise → heritage/retro → small club goods → useful help.
- Grid gaps and page rhythm should be intentional. Use non-rounded corners
  except where rounding represents an actual UI function.
- Avoid fake neon gradients, glassmorphism, decorative 3D, meaningless
  particles, animated noise, random icons, invented player photos.
- Promotions are only shown when backed by actual stock, contractually
  available delivery and a verified price.

## Writing / tone

Concrete Polish rather than marketing filler. Prefer "Bluza z logo retro",
"Zawodnik z listy" and "Wybierz rozmiar" over "Niesamowita kolekcja",
"Best of the best", "The Green Culture" and other synthetic slogans.

No fabricated reviews, countdown timers, discounts, sales ranking, scarcity,
shipping promises or estimated delivery dates. Use verified club language,
product names and source images only.

## Store behavior

Search and filters must use the same live catalog; selected sizes and
personalization must respect per-variant stock and product configuration.
Cart, favorites and recently-viewed list are local browser conveniences;
recently-viewed items are not stored in customer account records.

The prelaunch store deliberately **does not accept new orders or registration**.
Do not merely remove its notices or bypass the checkout gate. Enable it only
after actual seller data, terms/privacy/returns, fully verified inventory,
secure provider-backed payments, shipping service, transactional communications
and fiscal documents have been integrated, reviewed and tested.

## Editorial product module rules

The feature about surname/number may appear only when an actual catalog item
has `personalization_enabled`; its photograph and price must match that item.
Never depict a custom uniform that is not in the catalog, imply player approval
or invent a front/back imprint mockup. An illustrative court drawing should
remain clearly background graphic, not a print preview.

Accessories are selected from current `Akcesoria` catalog data and link to
their actual product pages. No fake product packshots.

## Images and performance

- Prefer local, authorized photographs and original merchandise photos.
- Keep source imagery well framed and avoid heavy saturation/filters.
- Eager-load critical above-the-fold image(s); lazy-load lower editorial areas.
- Always provide alt text for merchandise, empty alt text only for decoration.
- Provide a usable fallback for unavailable media.
- No layout shift caused by late imagery where a stable aspect ratio is possible.

## Mobile, interaction, accessibility

Mobile is designed, not just desktop shrunk: fewer columns, shorter copy,
usable touch targets, real heading hierarchy, consistent image aspect ratios,
and no sticky UI that obscures purchases. Respect reduced motion.
Navigation, filters, focus visibility and modal keyboard behavior are part
of design quality, not optional polish.

## Backoffice style

Keep the operational dashboard visually related to the store but restrained:
functional dense tables, clear status language, careful data entry, audit
history and predictable controls. A real user needs to distinguish an imported
stock adjustment from a reserved DTF batch immediately; decorative KPI cards
must never replace this.

## Next delivery milestones

1. Real photographs and accurate garment specifications approved by the club.
2. Product media gallery with verified size chart and merchandising hierarchy.
3. True checkout through PSP plus carrier labels, customer communications and
   seller/legal identity; independent security + commerce verification.
4. Staff operations finish: production traceability, barcode scanner flow,
   transfer batch costs, fulfillment and returns.
5. Android worker app only after the complete browser workflow is stable.

Never describe a capability as completed just because an interface for it exists.
