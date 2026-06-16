
## Problem

The Master Catalogue already has a **Print Attributes** section (`catalog_print_attrs`) with three sub-attributes — `colour_mode`, `sides`, `orientation` — and the values you see on screenshot 2 (Black & White / Full Colour / Mixed, Single-sided / Double-sided / Mixed, Portrait / Landscape).

But the Source dropdown on the per-product **Edit Option** dialog (screenshot 5) only offers:
- Manual (custom)
- Document Size (Master Catalogue) → `catalog_sizes`
- Paper Stock (Master Catalogue) → `catalog_papers`
- Finishing (Master Catalogue) → `catalog_finishing`

There is no entry that points at `catalog_print_attrs`, so Print Colour and Print Sides are stuck on `manual` and can't be migrated, even though the catalogue data exists. This plan wires that fourth source in.

## Approach

Add one new source — **"Print Attribute (Master Catalogue)"** — with a sub-attribute picker (mirroring how Finishing already picks a category). Print Colour will point at `colour_mode`, Print Sides at `sides`, and Orientation (future) at `orientation`. No schema changes, no migration — `catalog_print_attrs` already exists and is populated.

Pricing note: Print Colour and Sides aren't priced as flat per-value deltas — they're priced via **Click Charges** in Master Pricing (screenshot 3, already keyed by size × colour × sides). So the catalogue mirror rows keep `price_impact = 0` by default and the "Edit in Master Catalogue" link on the dialog points at Master Pricing → Click Charges, the same way Papers does.

## Files to change

1. **`src/components/admin/ProductOptionsEditor.tsx`**
   - Extend `OptionSource` with `"catalog.print_attrs"` and add it to `SOURCE_OPTIONS` (label: "Print Attribute (Master Catalogue)", description: "Pulled live from Master Catalogue → Print Attributes (pick an attribute)").
   - Add `"catalog.print_attrs": "/admin/master-pricing"` to `MASTER_LINKS`.
   - Add `printAttribute: string` to `OptionFormData` (mirrors `finishingCategory`).
   - In `refreshCatalogMirror`, add a branch that filters `catPrintAttrs` rows by `form.printAttribute` and projects them via `make(code, label, attribute, "per_document", { attribute, ...metadata })`.
   - Render a second sub-picker block (just under the Finishing-category one) when `source === "catalog.print_attrs"`, listing the distinct `attribute` values (`colour_mode`, `sides`, `orientation`).
   - In `openEditOption`, hydrate `printAttribute` from `(opt as any).source_filter?.attribute ?? ""`.
   - In `handleOptionSubmit`, when source is `catalog.print_attrs`, persist `source_filter: { attribute: optionForm.printAttribute }` and guard with a toast if it's blank.
   - In the list table's Source badge (around line 540-ish — same place the existing `finishing · cover` chip is built), render `print_attr · colour_mode` etc.

2. **`src/hooks/useCatalog.ts`** (or wherever `useCatalogFinishing` lives)
   - Add `useCatalogPrintAttrs()` returning `select * from catalog_print_attrs where is_active order by attribute, sort_order`. Wire it into `ProductOptionsEditor` next to `catFinishing`.

3. **`src/lib/catalog/optionAdapter.ts`** (customer-facing overlay)
   - Add `printAttrRowsToValues` + an `enrichPrintAttrValuesFromMaster` pair, mirroring the finishing helpers. Key by `code`, group by attribute capitalised ("Colour", "Sides", "Orientation"), keep per-product `price_impact` / `is_default`.

4. **`src/hooks/useCatalogBackedOptions.ts`**
   - When a saved `product_options` row has `source === "catalog.print_attrs"`, overlay the customer-visible values from `catalog_print_attrs` (same shape as the Finishing path).

## Out of scope

- No new tables, no migration, no changes to Click Charges pricing — those are unaffected.
- No automatic conversion of existing manual Print Colour / Print Sides rows. Once the new source is available, you'll open each option, change Source to "Print Attribute" → pick `colour_mode` / `sides`, toggle the values you want enabled, hit Update. The mirror builder preserves your manual list if you flip back.

## Verification

- Open Bound Documents → Print Sides → Edit Option → Source dropdown now lists "Print Attribute (Master Catalogue)" as a 4th choice.
- Pick it, choose `sides`, see Single-sided / Double-sided / Mixed appear as a read-only mirror with Enabled/Default toggles.
- Save, reopen — selections persist, Source column on the table shows `print_attr · sides (3/3)`.
- Customer configurator on a bound document still shows Print Sides with the same three options.
