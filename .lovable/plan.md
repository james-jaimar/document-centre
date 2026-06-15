## Goal

Collapse the three confusing tabs (Catalogue / Options / Recipe) down to two — **Catalogue** and **Options** — with **Options** as the single place an admin configures what a customer sees. All option values come from Master Catalogue + Master Pricing. Nothing hard-coded.

## What's wrong today

- **Options tab** shows hard-coded values entered in the Edit Option dialog (A4, A5, US Letter…). It does not read Master Catalogue or Master Pricing.
- **Recipe tab** is what I built to wire papers/finishing/engine to Master Pricing — but conceptually that's the same job as Options. Two screens, one job.
- **Catalogue tab** links the family to master sizes/print-attrs (this part is fine).

Result: admins edit the same concept in three places, and the customer-facing picker still reads the hard-coded Options values.

## Target shape

```text
Product Family
├── Catalogue tab   → which master items (sizes, print attrs) this family uses
└── Options tab     → ordered list of option groups the customer sees
                        each group:
                          • name (e.g. "Document Size", "Paper Stock", "Binding")
                          • source: catalog.sizes | catalog.papers | catalog.finishing[:category] | manual
                          • required / sort
                          • per-value: enabled, default, price override
                        values are READ-ONLY mirrors of master data, never typed in
```

Recipe tab is deleted. Its three responsibilities move into Options:

| Recipe today                | New home                                                    |
| --------------------------- | ----------------------------------------------------------- |
| Pricing engine selector     | Family-level setting on the family form (not per-option)    |
| Available papers + default  | A "Paper Stock" option group, source = `catalog.papers`     |
| Finishing items + required  | One option group per finishing category, source = `catalog.finishing:<category>` |

## Plan

### 1. Schema additions (one migration)

Add to `product_options`:

- `source` text — `manual` (default, legacy) | `catalog.sizes` | `catalog.papers` | `catalog.finishing`
- `source_filter` jsonb — e.g. `{ "category": "lamination" }` for finishing groups; `null` otherwise

Add to `product_families`:

- `pricing_engine` text — `click_charges` (default) | `photo_prints`

Both nullable / defaulted so nothing breaks.

### 2. Rewrite `ProductOptionsEditor.tsx`

- New "Source" dropdown at the top of the Edit Option dialog: Manual / Document Size / Paper Stock / Finishing (with category sub-picker).
- When source ≠ Manual:
  - Values list becomes a **read-only mirror** of the chosen catalog, fetched live. Each row shows label + code from master and exposes only three controls: **Enabled**, **Default**, **Price override** (optional, falls back to master pricing).
  - "Add value" / label / slug / metadata editors are hidden — those live in Master Catalogue / Master Pricing.
  - A small "Edit in Master Catalogue →" link jumps to the right master screen.
- Manual mode keeps today's free-form editor (for the rare hand-curated option).
- The Options list view shows a `Source` badge per option so it's obvious where values come from.

### 3. Delete Recipe

- Remove the Recipe tab from `AdminProducts.tsx` (and `PlatformProducts.tsx` re-export).
- Delete `src/components/admin/ProductRecipeTab.tsx`, `src/hooks/useProductRecipe.ts`, `src/lib/seedDefaultRecipes.ts`, the "Seed Default Recipes" button.
- Migration: for each existing `product_recipes` row, create equivalent catalog-backed option groups on the family (Paper Stock + one Finishing group per category) and set `families.pricing_engine`. Then drop the `product_recipes` table.

### 4. Make the customer picker actually read from master

- `useCatalogBackedOptions` already does the overlay; tighten it so that when an option has `source = catalog.*` it **replaces** values from master (not "overlays if names match"), and applies the per-family enabled/default/price-override layer.
- `calculatePrice.ts` keeps the existing master-pricing lookup path; remove the legacy `product_options.price_impact` fallback for catalog-sourced groups.

### 5. Cleanup

- Remove the per-value "Standard Sizes / International Sizes" group editor for size options — that grouping comes from `catalog_sizes.region` now.
- Keep `product_options` table (it's now the spine); just most rows hold a `source` pointer + a thin overrides layer instead of duplicated value data.

## Out of scope

- Tenant/branch override editors (`MasterCatalogPricingEditor` already covers those).
- Pricing engine changes beyond moving the selector.

## Files touched

- migration: `product_options.source`, `product_options.source_filter`, `product_families.pricing_engine`, drop `product_recipes`
- `src/components/admin/ProductOptionsEditor.tsx` — rewrite editor
- `src/pages/admin/AdminProducts.tsx` — remove Recipe tab + seed button
- delete: `ProductRecipeTab.tsx`, `useProductRecipe.ts`, `seedDefaultRecipes.ts`
- `src/hooks/useCatalogBackedOptions.ts` — replace-mode for catalog-sourced groups
- `src/lib/calculatePrice.ts` — drop legacy fallback for catalog groups

## Verify

- Master Pricing → add a paper → it appears immediately in Bound Documents → Options → "Paper Stock" without any per-family edit.
- Toggle a size off in Catalogue tab → disappears from customer picker.
- Override one paper's price on the family → customer sees the override; everyone else sees master.
- Customer configurator on `/t/:slug/...` renders only catalog-sourced options; no hard-coded A4/US Letter values remain.