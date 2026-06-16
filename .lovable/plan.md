# Three bugs to fix on the customer configurator

## 1. "Manage Tabs & Inserts" no longer opens

**Cause.** `OrderBuild.tsx` decides whether tabs are active by reading `metadata.tab_count` / `metadata.pack_count` / `metadata.color` off the selected Tab Dividers value. The new master rows in `catalog_finishing` (`tab-none`, `tab-pack-white`, `tab-pack-multi`) carry no such metadata, so `tabInfo` is always `null` and the **Manage Tabs & Inserts** button never renders. Same root cause means the auto-open effect never fires.

**Fix (two layers, so this can't break again):**

- **Migration** — backfill the master `catalog_finishing` rows so each tab/insert variant carries the metadata the UI needs:
  - `tab-pack-white` → `{ pack_size: 10, tab_count: 10, pack_count: 1, color: "white", material: "card", printable: true }`
  - `tab-pack-multi` → same with `color: "multi"`
  - `insert-slip-80` / `insert-slip-160` / `insert-divider-colour` → `{ kind: "insert", color: "white" | "white" | "assorted" }`
- **Code** — make `OrderBuild.tsx` derive `tabInfo` defensively: if the selected value belongs to `category: tab_dividers` (or its slug starts with `tab-`) and is not the "none" row, treat it as enabled and fall back to `pack_size` / a default of 10 tabs when `tab_count` isn't set. Same for inserts (category `inserts`, non-none → enabled).

## 2. Customer sees slug `a4` instead of `A4 Landscape`

**Cause.** Two things compound:

1. `OptionSelector` / `OptionsPanel` fall back to the raw slug when the selected value isn't in the values list (`selectedValue?.label ?? value`). The PDF preflight writes the slug `a4` into `selected_options`, but for Presentations the only catalogue-linked size is `a4-landscape`, so no match is found and the customer sees `a4`.
2. The size auto-match in `OrderBuild.tsx` accepts the first portrait-OR-landscape hit. When both `a4` and `a4-landscape` are enabled (bound documents) it picks `a4` even when the uploaded PDF is landscape.

**Fix.**

- In `OrderBuild.tsx` size auto-match: score each candidate and **prefer the value whose stored orientation matches the PDF's actual orientation** (landscape PDF → `a4-landscape`); cross-orientation match is only used when no same-orientation row exists.
- In `OptionSelector` and `OptionsPanel.getDisplayValue`: when no value matches the selected slug, render a humanised fallback (`a4-landscape` → `A4 Landscape`) instead of the raw slug, so legacy/edge cases never expose slugs to customers.

## 3. Audit other customer-facing slug leaks

Quick sweep of customer surfaces — Cart line summary, Order Confirmation, Customer Quote/Order detail, PriceSummary "Selected options" — to ensure every place that prints an option value uses the resolved `label` (with the same humanised fallback), never the raw slug from `selected_options`. Any place currently rendering `slug` will be switched to label lookup.

## Files

- `supabase/migrations/<new>.sql` — UPDATE `catalog_finishing` metadata for `tab-pack-white`, `tab-pack-multi`, `insert-slip-80`, `insert-slip-160`, `insert-divider-colour`.
- `src/pages/dashboard/OrderBuild.tsx` — defensive `tabInfo`/`insertEnabled` derivation; orientation-preferring size auto-match.
- `src/components/order/OptionSelector.tsx`, `src/components/order/OptionsPanel.tsx` — slug→label humanised fallback.
- `src/pages/dashboard/Cart.tsx`, `src/pages/dashboard/OrderConfirmation.tsx`, `src/components/order/PriceSummary.tsx` (and any matching admin/customer detail views found in the sweep) — switch any remaining slug renders to resolved labels.

## Out of scope

- No changes to the PDF preflight pipeline — it can keep sending the base ISO code (`a4`); the configurator will resolve the correct landscape variant.
- No changes to admin-side tooling.
