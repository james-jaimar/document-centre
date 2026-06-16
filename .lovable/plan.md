I found the same class of issue behind Presentations: the admin editor and customer configurator are not using one authoritative path for catalogue-backed options.

## Confirmed findings

- **Presentations → Binding** is still stored as legacy values (`comb-binding-black`, `spiral-binding-white`, etc.), while the master catalogue uses canonical codes like `comb-6mm`, `spiral-10mm`, `wire-8mm`.
- Opening the option in Admin currently rebuilds the edit dialog from the whole master category, so it shows **25 master binding rows**, while the customer side still sees the old 6 legacy rows until saved.
- This mismatch exists across other products/options too, especially:
  - **Presentations**: Binding, Covers, Cover Lamination, Inserts, Tab Dividers, Finishing
  - **Bound Documents**: Inserts, Tab Dividers, some Finishing aliases
  - **Booklets**: Covers, Cover Lamination, some Paper Stock aliases
  - **Brochures/Flyers/Posters/Business Cards**: Lamination and Paper Stock aliases
  - **Ring Binders / Stapled Loose Pages**: Inserts, Tab Dividers, Hole Punching, Finishing/Paper aliases
- Some “none” options (`no-lamination`, `no-inserts`, `no-tab-dividers`, etc.) are used by products but do not exist as canonical zero-price master catalogue rows, so they cannot be linked cleanly.

## Plan

1. **Fix the admin editor mirror**
   - Stop `ProductOptionsEditor` from replacing an existing saved product list with every active master row just because the dialog opened.
   - Existing product values remain authoritative; master data only refreshes labels, metadata, and prices.
   - New catalogue-backed options can still seed from master active rows.

2. **Fix the customer option resolver**
   - Treat saved product values as authoritative whenever they exist.
   - Never silently fall back to “all master rows” when saved values fail to match master codes.
   - Preserve product-level enabled/default toggles and branch disables.

3. **Add catalogue alias resolution**
   - Add a shared canonicalisation layer for old slugs → master codes, e.g.:
     - `no-cover` → `cover-none`
     - `clear-front-black-card-back` → `clear-front-black-back`
     - `gloss-lamination-front-cover` → canonical single-side lamination
     - sized legacy papers like `80gsm-bond-a4` → `80gsm-bond`
   - Use this in both admin and customer resolution so legacy rows link back to master pricing instead of staying detached.

4. **Repair missing master catalogue rows**
   - Add zero-price canonical “none” rows where products need an explicit no-charge choice.
   - Add or map legitimate missing product options that do not currently exist in master, especially Presentation-specific binding colour variants if they should remain sellable.
   - Add matching `catalog_finishing_prices` rows for those new master rows so pricing is not product-local or hard-coded.

5. **Data migration: normalise product options**
   - Update existing `product_options.values` from legacy slugs to canonical master catalogue codes where a safe mapping exists.
   - Preserve each product’s enabled/default settings and any intentional price override.
   - Leave ambiguous values untouched only if they cannot be mapped safely, and report them.

6. **Verification sweep**
   - Re-run a database audit showing, per product/option, active values vs linked master values.
   - Target end state: every active `catalog.papers`, `catalog.finishing`, `catalog.sizes`, and `catalog.print_attrs` value either links to a master catalogue row with pricing metadata, or is intentionally manual.
   - Spot-check customer dropdowns for Presentations, Bound Documents, Booklets, Flyers, Posters, Brochures, Business Cards, Ring Binders, and Stapled Loose Pages.

## Technical files/migrations involved

- `src/components/admin/ProductOptionsEditor.tsx`
- `src/hooks/useCatalogBackedOptions.ts`
- `src/lib/catalog/optionAdapter.ts`
- One Supabase migration to add missing master rows/prices and canonicalise existing product option values.

This keeps the admin product settings as the source of truth, but guarantees every catalogue-backed value actually resolves to the master catalogue and master pricing.