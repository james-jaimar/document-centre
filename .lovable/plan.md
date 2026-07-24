
## Goal

Make adding a new simple flat-sheet product (stickers, labels, magnets, notepads, etc.) a **5-minute, one-screen job for a platform admin**, with no code changes, no seed scripts, no SQL, and no dev hand-off for images or custom sizes.

## Current pain (verified in code)

- Adding a family today means jumping across ~6 screens: Family form → Catalogue Links → Imposition Defaults → Options editor (build size/paper lists) → Master Pricing → Variants (if any) → Pack Pricing (if any).
- **No image upload** — `product_families.image_url` exists in the DB but `ProductFamilyForm` never renders a field for it. New slugs fall back to a hardcoded `SLUG_IMAGE_MAP` in `NewOrder.tsx`, so any truly new product ships with just an icon until a dev adds a bundled asset.
- **Custom sizes** (90×50 sticker, 850×2000 banner) can only be added on a separate Platform → Master Catalogue screen, then linked back on the family — two-screen dance per size.
- **Configurator/preview behaviour is slug-string-matched**, not template-driven — flyers/posters/handouts/brochures are literally hardcoded in `OrderBuild.tsx` and `PreviewPanel.tsx`. A new "Stickers" slug can't opt into "single flat sheet" behaviour without editing source.
- Nothing in the UI prevents configuring pack pricing + variant pricing + rules simultaneously; picking the wrong pricing engine is easy and silent.

## What we'll build

### 1. `product_families.kind` field (template selector) — DB migration

Add `kind text` column with values: `flat_sheet` · `bound_document` · `folded_leaflet` · `saddle_stitched` · `business_card` · `large_format` · `photo_print` · `custom`.

Default existing rows by mapping current slug → kind (one-off backfill). Replace slug-string checks in `OrderBuild.tsx` (`isSingleSheetFamily`, `isSaddleStitchedFamily`) and `PreviewPanel.tsx` (`BOUND_TYPES`, `FOLD_TYPES`) with `family.kind` checks. This is the architectural unlock — behaviour becomes admin-configurable, not source-coded.

### 2. Add-Product Wizard (new screen)

`src/pages/admin/AdminProductWizard.tsx` — a single guided screen with tabs for each step, that writes to all the underlying tables in one submit. Replaces the "New Product Family" button on `AdminProducts.tsx` for the common case (existing per-tab editors remain for advanced tuning).

Steps:

1. **Basics** — name, slug (auto), kind picker (visual cards with icons + descriptions), description, hero image upload.
2. **Sizes** — searchable list of existing `catalog_sizes` with checkboxes, PLUS an inline "+ Add custom size" form (name, w mm, h mm) that inserts into `catalog_sizes` and links in one action.
3. **Papers** — same pattern: check existing papers, inline "+ Add paper" that also lets you set a price right there.
4. **Print options** — checkbox grid for print colour (mono/colour), sides (single/duplex), and finishing items relevant to the kind. Wizard auto-hides irrelevant options for `flat_sheet` (no binding, no fold).
5. **Pricing model** — mutually-exclusive radio: *Pack pricing* / *Per-unit rules* / *Variant matrix*. Only the relevant editor opens. Locks `quantity_mode` and prevents the current double-configuration risk.
6. **Review & publish** — summary, save.

Server work is done via a single `create_product_family_bundle` RPC (or edge function) so the wizard is atomic — no half-created families.

### 3. Hero image upload

Add image field to `ProductFamilyForm` and the wizard. Upload to a new `product-images` public storage bucket, store the URL in `product_families.image_url`. `NewOrder.tsx` already prefers `family.image_url` over `SLUG_IMAGE_MAP`, so this drops the dev hand-off entirely for new products.

### 4. Inline custom sizes on the family

Move (or duplicate) the `catalog_sizes` create form from `PlatformCatalog.tsx` into a lightweight popover on the wizard's Sizes step and on `ProductCatalogueLinksTab.tsx`. Same insert path, no navigation.

### 5. Sensible defaults for `flat_sheet`

When kind = `flat_sheet`, wizard preselects:
- `pricing_engine = "click_charges"`, `quantity_mode = "blocks"` (pack pricing) as the default
- `printing_rules.min_qty = 25`
- No binding option, no fold option
- Imposition strategy = "cut sheet from parent" auto-suggested per size using `IMPOSITION_MAP` (e.g. 90×50 → 24-up on SRA3)
- Preview automatically falls into flat/loose_sheets path (already the default when no binding/fold option is present — no code change needed once `kind` gate is in).

### 6. Guardrails

- Family form disables `quantity_mode = "blocks"` if `product_variant_links` rows exist, and vice versa. Toast explains why.
- Wizard's Pricing step surfaces the current `pricing_engine` + `quantity_mode` in plain English ("Customers pick a pack of 100/250/500 and pay a fixed price").

## Out of scope for this round

- Free-form "customer types any WxH" size input (separate feature — needs pricing engine changes)
- Refactoring `seedBoundDocument.ts` / `seedAllProducts.ts` (leave as-is; wizard makes them obsolete for new work)
- Tenant/branch-level product creation (still platform-admin-only, matching current model)

## Technical notes

- **Migration**: `product_families.kind text` + backfill from slug + `image_url` already exists (no schema change there). New storage bucket `product-images` (public, with size limit).
- **New RPC** `public.create_product_family_bundle(payload jsonb)` — SECURITY DEFINER, platform_admin only, wraps: `INSERT product_families` → `INSERT product_catalog_links` (sizes/papers/print_attrs) → optional `INSERT catalog_sizes`/`catalog_papers` → `INSERT product_imposition_defaults` → optional `UPDATE product_families.quantity_blocks` → optional `INSERT product_variant_links`. Returns the new family id.
- **Slug-check replacement**: audit `OrderBuild.tsx:268-293`, `PreviewPanel.tsx:80-87,335,563,658,853` and swap for `family.kind` (keep slug fallback for one release to be safe).
- **Wizard state**: react-hook-form with zod schema; each step is a fieldset, not a route, so the whole payload is one submit.

## Deliverables

1. Migration: add `kind` column + backfill; create `product-images` bucket + RLS.
2. New RPC `create_product_family_bundle`.
3. New file `src/pages/admin/AdminProductWizard.tsx` + route.
4. `ProductFamilyForm.tsx` — add `image_url` upload + `kind` selector + pricing-mode guardrail.
5. `NewOrder.tsx` / `PreviewPanel.tsx` / `OrderBuild.tsx` — replace slug string checks with `family.kind`.
6. `ProductCatalogueLinksTab.tsx` — inline "add custom size / paper" popover.
7. Update `AdminProducts.tsx` "New Product Family" button to route to the wizard; keep the raw form behind an "Advanced" link.

Ship in that order — items 1-4 unblock the flat-sheet use case; 5-7 tighten and future-proof.
