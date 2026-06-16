# Plan: Flip product options from legacy `manual` to catalog-backed

## What I found

Master catalogue (`tenant_id IS NULL`) currently has **65 product options** across 10 families. About half already point to a catalog source; the rest are still `source = 'manual'` (legacy hard-coded values). The catalogue itself is fully populated:

- `catalog_finishing` categories: binding (25), cover (29), lamination (4), folding (4), hole_punching (3), inserts (3), tab_dividers (2), stapling (3), trimming (3), special (6), guillotining (1), packaging (2).
- `catalog_papers`, `catalog_sizes`, `catalog_print_attrs` all populated.

So most `manual` rows can be safely flipped to a catalog source — they'll then resolve through `useCatalogBackedOptions` and inherit master pricing automatically.

## Mapping I'll apply

| Option name (per family) | New `source` | `source_filter` |
|---|---|---|
| Covers | `catalog.finishing` | `{category: cover}` |
| Binding (still manual on presentations / ring-binders) | `catalog.finishing` | `{category: binding}` |
| Cover Lamination / Page Lamination / Lamination | `catalog.finishing` | `{category: lamination}` |
| Tab Dividers | `catalog.finishing` | `{category: tab_dividers}` |
| Inserts | `catalog.finishing` | `{category: inserts}` |
| Hole Punching | `catalog.finishing` | `{category: hole_punching}` |
| Fold Type (brochures) | `catalog.finishing` | `{category: folding}` |
| Finishing (bound-documents, presentations, stapled-loose-pages) | `catalog.finishing` | `{category: trimming}` + special — see note |
| Special Finishing (business-cards) | `catalog.finishing` | `{category: special}` |

### Staying `manual` (no catalog equivalent — by design)

- **Print to Edge** — binary toggle, not a finishing SKU.
- **Photo Prints** options (Print Size, Border, Finish) — driven by the `photo_prints` rate-card engine, not the finishing catalogue.
- **Business Cards** Pack Size + Document Size — drive the `business_cards` matrix; not catalog rows.
- **Business Cards** Corner Style — cosmetic, no priced SKU.

I'll leave these on `manual` and note them in the migration comment.

## Approach

1. **Audit migration (data only)** — one `UPDATE` per option group that flips `source` / `source_filter`. `useCatalogBackedOptions` will then enrich values from `catalog_finishing` on first read.
   - For options that already have curated `values` JSON (e.g. Covers with custom prices), I'll keep `values` as-is; the enrichment path `enrichFinishingValuesFromMaster` merges saved values with master metadata, so customer-facing labels and prices are preserved while still pulling from catalogue.
   - For options with empty `values`, the catalog rows become the value list directly.
2. **Diff report** — after the flip I'll run a read-only query that shows, per family/option:
   - new source/filter
   - master catalog row count that would resolve
   - any options where resolved count is 0 (i.e. category exists but no rows match) — those need manual attention.
3. **Cascade to tenants** — the existing `clone_master_catalog_to_tenant` already mirrors catalog rows, but tenants have their own `product_options` rows (from earlier seeding). I'll run the same `source`/`source_filter` flip against tenant-owned product_options (`tenant_id IS NOT NULL`) so tenant configurators behave identically. Tenant-specific `values` overrides are preserved.
4. **Spot-check in the UI** — load the customer configurator for Bound Documents, Presentations, Ring Binders, Business Cards and confirm:
   - dropdowns populate from catalogue,
   - prices come through (clicks + paper + finishing),
   - no option becomes empty.
5. **Report back** with the diff table and any flagged rows.

## Technical detail

- Two `UPDATE` statements via `supabase--insert` (data change, not schema): one for master rows, one for tenant rows. Filter by `pf.tenant_id IS NULL/NOT NULL` and option name.
- No code changes expected — the catalog overlay is already live in `useCatalogBackedOptions`. If the spot-check turns up a real bug (e.g. a category mismatch), I'll fix it in a follow-up.
- No schema migration. No edge-function changes.

## Risks / guard-rails

- If a `manual` option held bespoke labels that don't exist in the catalogue (e.g. a Cover finish the admin invented), enrichment keeps the saved row by slug, so it won't disappear — it just won't get master pricing. The diff report will flag these.
- Photo Prints and Business Cards engines are intentionally not catalog-backed; leaving their options on `manual` is correct.

Ready to proceed on your approval.
