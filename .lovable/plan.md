
# Master Catalogues as Single Source of Truth

## The problem

Every product family today carries its own copy of sizes, paper stocks, finishing items, print colour, sides, etc. inside `product_options.values` (JSONB). A quick audit shows the same handful of values duplicated across **9+ product families** — e.g. `Paper Stock` is re-typed 7 times (18 values × bound-documents, presentations, ring-binders; 9–10 in others), `Document Size` is re-typed 9 times, `Print Colour` is re-typed 8 times. Update one stock price → you must touch every product. That's the bug.

Rate-card tables (`rate_card_papers`, `rate_card_finishing`, `rate_card_clicks`) already exist as proper master/tenant/branch tables — but products don't actually reference them. The recipe model (`product_recipes.available_papers`) was the start of the right idea; we now finish the job and extend it to **sizes** and **print attributes** which have no master table yet.

## The target model

```text
                ┌───────────── MASTER CATALOGUES ─────────────┐
                │  catalog_sizes        (A4, A3, US Letter…)  │
                │  catalog_print_attrs  (mono/colour, sides…) │
                │  rate_card_papers     (existing)            │
                │  rate_card_finishing  (existing)            │
                └───────────────────┬─────────────────────────┘
                                    │ referenced by code
                                    ▼
                       product_catalog_links
              (product_family_id, catalog, item_code, sort)
                                    │
                                    ▼
              branch_catalog_overrides   ← full override
        (branch_id, catalog, item_code,
         is_enabled, label, dimensions/metadata, price_delta)
```

- **One master catalogue per dimension.** Products do not store values; they store *references* to catalogue codes.
- **Branches get full override**: rename, change dimensions, override price, or disable entirely (you picked Full override).
- **`product_options` becomes a thin view** built at query-time by joining `product_catalog_links → master → branch overrides`. The JSONB `values` field stays only as a fallback for free-form options that genuinely are product-specific (we'll keep the column, just stop using it for the shared dimensions).

## What we build

### 1. New master catalogue tables

- `catalog_sizes` — `code` (e.g. `a4`), `label`, `width_mm`, `height_mm`, `iso_name`, `region`, `sort_order`, `is_active`. Seeded with A0–A6, SRA3, US Letter, US Legal, Tabloid, DL, square sizes, common photo sizes.
- `catalog_print_attrs` — `attribute` (`colour_mode` | `sides` | `orientation`), `code`, `label`, `sort_order`, `is_active`. Seeded with the obvious values (mono/colour, simplex/duplex, portrait/landscape).
- `rate_card_papers` / `rate_card_finishing` — **unchanged**, already the source of truth.

All four expose a master row set; the existing scope pattern (`scope_type` master/tenant/branch + tenant clone) is kept for papers/finishing. Sizes & print attrs are global (no per-tenant pricing) so a single `is_active` master row is enough.

### 2. New linking table

`product_catalog_links`:
- `id`
- `product_family_id`
- `catalog` enum: `size | paper | finishing | print_attr`
- `item_code` — FK by code into the matching master table
- `sub_attribute` — only used when `catalog = print_attr` (e.g. `colour_mode`)
- `sort_order`, `is_default`
- Unique on `(product_family_id, catalog, sub_attribute, item_code)`

This replaces the JSONB `values` for the four shared dimensions.

### 3. Branch override table

`branch_catalog_overrides`:
- `branch_id`
- `catalog`, `item_code`, `sub_attribute`
- `is_enabled` (default true)
- `label_override`, `metadata_override` (JSONB — used for sizes to change dimensions)
- `price_delta_minor`, `price_override_minor` (one or the other; for paper/finishing)
- Unique on `(branch_id, catalog, sub_attribute, item_code)`

This subsumes the current `branch_product_option_overrides` table (data migrated, table dropped at the end).

### 4. Resolver: `resolve_product_options(product_family_id, branch_id)`

Server-side SQL function (or RPC + view) that returns the same shape the front-end consumes today (`{ name, option_type, values: StructuredOptionValue[] }`) but is *built* from:
- `product_catalog_links` joined to master tables → base values
- Left-joined to `branch_catalog_overrides` for the branch → applies enable/disable, label, dimensions, price
- Falls back to free-form `product_options.values` for anything not catalogued (e.g. "Cover Style" labels that are genuinely product-specific)

`useResolvedProductOptions(productFamilyId, branchId)` is rewritten to call this. All downstream code (configurator, paper-size advisory, price summary, branch product specs dialog) keeps working because the shape is unchanged.

### 5. Admin UX

- **Platform → Master Catalogues**: new page with four tabs (Sizes, Print Attributes, Papers, Finishing). Papers/Finishing already exist in Master Rate Card — we just link them here.
- **Admin → Products → \[family\]**: the "Document Size", "Paper Stock", "Finishing", "Print Colour", "Print Sides" sections become **multi-select pickers from the master catalogue** (with default + sort), not free-form value editors. Other options (e.g. "Inserts", "Covers" labels) keep the JSONB editor.
- **Branch → My Products → \[family\]**: the existing `BranchProductSpecsDialog` is refitted onto `branch_catalog_overrides`. Same UI shape — enable/disable + override label/dims/price.

### 6. Automatic migration

A single migration that:

1. Creates the new tables and seeds master catalogues.
2. **Sizes**: scans every `product_options` row named `Document Size` / `Print Size`. For each structured value, parses dimensions out of slug/metadata (we already have `parseSizeOptionSlug`), matches to a master `catalog_sizes` row by dimensions (insert a new master row if no match, so nothing is lost), and inserts a `product_catalog_links` row.
3. **Papers**: matches values by label/weight/finish to existing `rate_card_papers` (creating new master papers for orphans), inserts links. Default paper carried over from `product_recipes.default_paper_code` where present.
4. **Finishing**: same approach against `rate_card_finishing` (matching on label + category).
5. **Print attrs**: maps the well-known labels (Mono/Black & White, Colour/Full Colour, Single-sided/Simplex, Double-sided/Duplex) to `catalog_print_attrs`.
6. **Branch overrides**: copies every `branch_product_option_overrides` row to `branch_catalog_overrides` by joining through the option value's slug.
7. Marks each migrated `product_options` row as `is_legacy = true` (kept around for one release as safety net), then a follow-up migration drops them.

The migration is idempotent and prints a per-family summary so we can sanity-check before the legacy drop.

## Technical notes

- All new tables get `GRANT SELECT TO anon, authenticated` (catalogue browsing is public for storefront) and `GRANT ALL TO service_role`. Write policies restrict catalogue edits to platform admins; override edits to tenant/branch members via `tenant_memberships`.
- The resolver is `SECURITY DEFINER` with `search_path = public` so storefront (anon) can read resolved options without leaking master pricing.
- Pricing engine (`calculatePriceFromRateCard`) already reads from rate-card tables, so no math changes — it just gets a cleaner option list.
- Order pricing snapshots remain immutable (`order_pricing_snapshots`), so historical orders are unaffected by master catalogue changes.
- `branch_product_option_overrides` is **renamed** rather than dropped, then dropped one release later, to give us a rollback window.

## Out of scope (call out, don't build)

- Per-tenant catalogue customisation (only branches override). Tenants inherit the master verbatim. We can add a `tenant_catalog_overrides` layer later with the same pattern.
- Reworking the photo-prints engine — it already reads from `rate_card_photo_prints` directly.
- Reworking pricing rules (`pricing_rules`) — separate concern.

## Verification

1. Update master price of `80gsm Bond A4` → re-open any storefront product that lists it → new price shown immediately, no per-product edits required.
2. Add a new size `SRA2` to `catalog_sizes`, link it to Posters only → appears on Posters storefront, absent from Bound Documents.
3. PostNet branch disables `US Letter` for Bound Documents in branch override → customer upload of US Letter PDF shows advisory **without** US Letter (already partially wired in the previous patch; resolver now drives it cleanly).
4. Branch sets `price_delta_minor = 500` for `300gsm Silk` → branch storefront shows the surcharge; tenant default unchanged.
5. Run migration on a copy of prod, diff `resolve_product_options(family, null)` against the legacy JSONB → identical option lists per family.

## Rough size

DB migration (~600 lines SQL incl. seeds) + 1 resolver function + 4 master-catalogue admin pages + refits of `ProductOptionsEditor`, `BranchProductSpecsDialog`, `useResolvedProductOptions`. Roughly 2–3 build sessions; the migration itself is the riskiest piece and worth a dry-run on a DB snapshot first.
