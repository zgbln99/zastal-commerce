# Product galleries and CMS campaigns

## Gallery API

`GET /api/admin/products/<positive-id>/gallery` returns `{images,revision}`.
An absent gallery returns an empty image list and revision `0`. `PATCH` accepts
exactly `{images,expected_revision}`. The entire ordered set is validated under
`BEGIN IMMEDIATE`, then the expected revision is checked. A successful write
increments the revision and returns the saved set. Invalid data is `400`, a
missing product is `404`, and a stale revision is `409`. Reload and reconcile
unsaved edits after a conflict; never silently overwrite another editor.

The routes retain the existing session, administrator role, origin and CSRF
requirements. JSON requests retain the existing 35,000-byte limit. Image upload
uses `POST /api/admin/home/media` with its existing JPG/PNG/WebP verification,
size/dimension limits, metadata stripping and WebP conversion. No gallery-specific
upload endpoint or relaxed limits are introduced.

Each image has these fields:

| Field | Contract |
| --- | --- |
| `id` | Unique ASCII letters, digits, `_` or `-`; 1–80 characters |
| `url` | Unique existing `/assets/…` regular file or `/api/store/media/<32 lowercase hex>.webp` |
| `role` | `packshot`, `model`, `detail` or `lifestyle` |
| `alt` | Plain string, at most 250 characters; no HTML or control characters |
| `illustrative` | Explicit JSON boolean; true for mockups or unverified material |
| `source_url` | Optional plain HTTPS URL, at most 400 characters, without credentials; defaults to `""` |

Maximum 20 images. Unknown fields, duplicate IDs/URLs, invalid types, remote image
URLs, traversal (including encoded forms), query strings, fragments, missing
files and asset symlinks escaping the asset directory are rejected. Source URLs
are provenance only and are never fetched by the server. The image array order
is authoritative; the display layer treats its first element as the cover.

`/api/products`, `/api/catalog`, `/api/catalog/<id>` and the admin product list
add `images` and `gallery_revision`, preserving existing keys. An absent or empty
gallery derives one fallback from the current `product_options.image`, labelled
`id: legacy-<id>`, `role: packshot`, `alt: <product name>`, `illustrative: true`,
`source_url: ""`. Existing safe legacy HTTPS URLs remain supported. An empty or
unsafe legacy URL yields `images: []`, allowing the storefront's existing
placeholder/static catalog fallback. Gallery writes never overwrite that legacy
image or any other product, price, stock, variant or personalization field.

## Storage and history

`commerce_media.init_schema` creates only `product_galleries` and
`product_gallery_revisions`. Both reference the existing product ID. Existing
tables, CMS content and media files are not rewritten. The first save retains
revision `0` (the previous empty state); every accepted save appends its full
ordered image set. Rejected writes append no history or audit records. Accepted
API writes add a descriptive `product-gallery` audit entry in the same
transaction. Removing an association or clearing the gallery does not delete
source files or history.

The module-level `save(conn, product_id, payload)` requires the caller to own the
`BEGIN IMMEDIATE` transaction and commit; the HTTP handler does so. Seed utilities
must follow the same transaction and revision discipline.

## CMS campaign contract

The schema stays at version `1`, and existing section types and published/draft
configurations remain unchanged. No campaign is inserted or published by migration.
The new `campaign` section requires exactly these settings:

`eyebrow`, `title`, `description`, `image`, `image_alt`, `image_role`,
`image_illustrative`, `product_ids`, `cta_text`, `cta_url`, `alignment`.

The existing text, link, alignment, image and CSV field validation applies.
`image_role` is `model` or `lifestyle`; `image_illustrative` is an explicit strict
boolean. The frontend defaults new imagery to illustrative. A disabled campaign
may have empty `image`, `image_alt` and `product_ids`. Any supplied image must be
an existing approved local asset/upload. An enabled campaign requires a valid
image, nonempty plain alt text and at least one existing product ID. Product IDs
are positive SQLite integers expressed as CSV. Save, publish and restore validate
provided product references against the current database. `validate(config)`
remains usable without a database for structural validation;
`validate(config, conn)` also checks referenced products.

Campaigns reuse existing draft, preview, optimistic revision, publish, restore
and history routes. Imagery roles and filenames never imply a photograph is real:
only the explicit boolean controls its illustrative status. Use confirmed matching
product/colour/design material. Mockups remain visibly illustrative. Do not fill
model/lifestyle slots with unrelated or generated photographs, and do not enable
an empty campaign.

## Reviewed initial media and seed utility

The versioned [product-media-sources.json](product-media-sources.json) records
the 12 existing cover files and two additional exact-match bag photographs,
with canonical gallery metadata, public HTTPS sources, visual classification
basis, source SHA256, published asset SHA256, dimensions and transformations.
Existing covers remain byte-for-byte unchanged. Apparel products 1–7, 9 and 10
are illustrative official visuals; accessory covers 8, 11 and 12 are genuine
product photographs. Classification reflects visual review, not a provenance
claim made by the supplier.

Only product 8 adds `/assets/photos/gallery/product-8-detail.webp` (fabric and
printed-logo detail) and `product-8-back.webp` (rear packshot). Their original
sources are `20260430_121025-scaled.jpg` and
`20260430_121140-removebg-preview.png`. Conversion uses lossy WebP quality 88,
strips metadata and preserves aspect ratio within 1600×1600 without upscaling.
No crop, recolouring or artwork edits are performed; source cutout composition
is preserved. The low-resolution rear source remains 433×577. A keychain image
with different face artwork is excluded. General fan photography is excluded
from SKU galleries. No exact-product model/lifestyle photos are verified and
no campaign is inserted or published.

Run the utility with an explicit existing database path. Default preview opens
SQLite read-only, does not create missing databases and does not migrate schema:

```sh
python3 tools/seed_product_media.py --database /path/to/isolated-copy.sqlite3
```

After backup and isolated-copy verification, applying requires both explicit
flags. The approval flag is required for **every** write, including a test copy;
the utility never guesses whether a path is production:

```sh
python3 tools/seed_product_media.py --database /path/to/isolated-copy.sqlite3 --apply --approve-production-write
```

The utility validates the reviewed IDs/SKUs, exact legacy option image values
(product 1 uses `/assets/photos/product-1.webp`; products 2–12 are empty), approved
gallery scope and truth labels, and every deployed file SHA256. Missing products
or differing SKUs/images refuse the entire import. Empty legacy fields stay
empty; their static catalogue covers become gallery associations only. No
product, options, stock, variant, account, order, CMS, audit or other old table
is rewritten. Every gallery with revision greater than zero is skipped, including
a gallery intentionally cleared by an administrator; nonempty revision-zero
data is also protected. Re-running preserves gallery timestamps and history.

Applying uses one `BEGIN IMMEDIATE` transaction for catalogue checks, additive
gallery schema initialization and all saves. A late mismatch rolls back both
earlier saves and newly created gallery tables. The initial empty revision and
new ordered set are retained through `commerce_media.save`. The utility does
not invoke the broader commerce bootstrap, fetch source URLs, write uploads or
mutate CMS. The controller performs initial import only after verifying an
isolated database copy.

## Isolated verification

Run against temporary databases only:

```sh
ZASTAL_TEST_MODE=isolated-only python3 -m unittest discover -s tests -p test_media.py -q
ZASTAL_TEST_MODE=isolated-only python3 -m unittest discover -s tests -p test_cms.py -q
ZASTAL_TEST_MODE=isolated-only python3 -m unittest discover -s tests -p test_seed_product_media.py -q
ZASTAL_TEST_MODE=isolated-only python3 -m unittest discover -s tests -q
```

The test mode is solely for isolated test workflows. Never enable it on production;
the public prelaunch sales and registration gates remain in effect.
