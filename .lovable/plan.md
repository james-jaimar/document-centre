## Goal

Master Pricing at the **platform scope** should stop being a parallel list and instead **edit the Master Catalogue's prices directly**. Tenant and branch scopes keep `rate_card_*` as override layers, but those overrides are seeded from the catalogue and only carry a *price delta*, not a duplicated item list. Renaming a paper or adding a finishing item in the catalogue then flows through to every tenant and storefront automatically.

## What changes at each scope

### Platform → Master Pricing (`/platform/pricing`)
- **Papers tab** → edits `catalog_papers` + `catalog_paper_prices` (per-size pricing already exists from the recent backfill). No more free-text code/label/weight/finish/category.
- **Finishing tab** → edits `catalog_finishing` + `catalog_finishing_prices` (per-size, including the `'any'` sentinel for size-agnostic items).
- **Click Charges tab** → size picker stays on `catalog_sizes`; colour and sides dropdowns now sourced from `catalog_print_attrs` (attributes `colour` and `sides`).
- **Photo Prints** and **Business Cards** tabs are unchanged for this pass (they're their own product families with their own option sets).

### Tenant → Pricing (`/admin/pricing`)
- Continues to read `rate_card_papers` / `rate_card_finishing` / `rate_card_clicks` for that tenant.
- Items are **no longer free-typed**: Add buttons let you pick from the master catalogue. Selecting a catalogue paper/finishing item creates a `rate_card_*` row that **references the catalogue row by code** and **inherits the master price unless the tenant edits it**.
- "Pull missing from master" still works and now pulls anything new the platform has added to the catalogue.

### Branch → Pricing (`/branch/pricing`)
- Same picker behaviour as tenant scope, but seeded from the tenant copy.
- Branch edits remain branch-only.

## Schema changes

1. **`rate_card_papers`**: add `catalog_paper_id uuid REFERENCES catalog_papers(id) ON DELETE CASCADE` and `catalog_size_code text REFERENCES catalog_sizes(code)`. Backfill by matching existing rows on `(code, size)`. Keep `code`/`label`/`weight_gsm`/`finish`/`size` as denormalised cached columns for now (filled by trigger from the catalogue row) so existing reads don't break.
2. **`rate_card_finishing`**: add `catalog_finishing_id uuid REFERENCES catalog_finishing(id) ON DELETE CASCADE` and `catalog_size_code text REFERENCES catalog_sizes(code)` (nullable → uses `'any'`). Backfill on `(code, size)`.
3. **`rate_card_clicks`**: add `catalog_size_code text REFERENCES catalog_sizes(code)` and store `colour`/`sides` as the catalogue codes (already are — just enforce via FK to `catalog_print_attrs(code)` filtered by attribute).
4. **`clone_master_rate_card_to_tenant()`** and **`resync_branch_pricing_from_tenant()`**: rewrite to source from `catalog_*` + `catalog_*_prices` instead of `rate_card_*` master rows. Master scope rate-card rows become unnecessary; the migration drops them once the front-end is migrated.
5. **Catalogue add/edit**: ensure `catalog_papers` exposes `weight_gsm` and `finish` on the platform Master Catalogue UI (it does); add a "Used in pricing" badge so admins can see which catalogue rows have prices defined.

## Front-end changes

- `src/components/pricing/RateCardEditor.tsx`
  - Remove `FINISH_OPTIONS` and `FINISHING_CATEGORIES` constants.
  - `PapersTab`: Add dialog becomes a two-step picker (choose catalogue paper → choose size from that paper's allowed sizes) instead of free-text fields. Edit dialog only exposes prices + `is_active` + `sort_order`.
  - `FinishingTab`: same pattern — pick a catalogue finishing item, then a size (or "Any size").
  - `ClicksTab`: replace the hard-coded colour/sides selects with selects driven by `useCatalogPrintAttrs()` filtered to `attribute = 'colour' | 'sides'`.
  - At **master scope**, the editor writes to `catalog_paper_prices` / `catalog_finishing_prices` directly (new mutation hooks). Tenant/branch scopes keep using `rate_card_*` mutations.
- `src/hooks/useCatalog.ts` — add `useCatalogPaperPrices`, `useCatalogFinishingPrices`, and upsert/delete mutations for those tables.
- `src/pages/platform/PlatformMasterPricing.tsx` — pass a flag so the editor knows to use catalogue-price mutations.

## Migration / data safety

- All schema changes are additive first. Backfill runs in the same migration using `(code, size)` joins from existing rate-card rows to catalogue rows. `ON CONFLICT DO NOTHING` everywhere, safe to re-run.
- A second migration (after front-end ships) drops master-scope rows from `rate_card_papers` / `rate_card_finishing` / `rate_card_clicks` because the catalogue is now authoritative for master.
- Existing tenant and branch rate cards are untouched — they just gain the FK columns.

## Out of scope for this round

- Photo prints and business-cards tabs (separate product families).
- Migrating `pricing_rules` to draw size/paper from the catalogue — those still come through `calculatePriceFromRateCard` which already consumes the rate-card snapshot.

## Verification

- After migration: `select count(*) from rate_card_papers where catalog_paper_id is null;` and the same for finishing should both be `0` once backfill runs.
- Master Pricing UI shows the same rows it does today, but Add/Edit dialogs only allow picking from catalogue lists.
- Editing a paper label in Master Catalogue immediately changes the label shown in Master Pricing and (via the cached column trigger) in tenant rate cards on next read.
