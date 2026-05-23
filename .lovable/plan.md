## Add per-row Active toggle to every product option value

Add an `is_active` flag on each structured option value across all product options (not just tab dividers), so admins can hide rows without deleting them. Disabled rows stay in the master config and are simply filtered out of customer-facing selectors.

### Changes

**1. `src/lib/productOptionTypes.ts`**
- Add `is_active?: boolean` to `StructuredOptionValue` (optional for backward compat; treated as `true` when missing).
- Default new values created via `createOptionValue` to `is_active: true`.
- Add a helper `isValueActive(v)` returning `v.is_active !== false` for consistent filtering.

**2. `src/components/admin/ProductOptionsEditor.tsx` (universal — used by every product family)**
- Add an "Active" switch to `ValueEditorRow`, placed before the existing "Default" switch.
- When `is_active === false`, render the row at reduced opacity with a subtle "Hidden" badge so admins can see it's off at a glance.
- New rows added via "Add Value" default to active.
- When loading legacy values without `is_active`, treat them as active.
- `GroupedValuesPreview` shows `active/total` counts per group (e.g. `Colour (3/5)`).

**3. Customer-side filtering**
Filter out inactive values wherever option choices are presented to the customer. The admin editor still shows all rows. Files to audit and update with `isValueActive` filtering:
- `src/pages/dashboard/OrderBuild.tsx` and any child selector component (binding, paper, cover, lamination, tab dividers, inserts, finishing, etc.).
- `src/hooks/useOrderBuilder.ts` if it normalises options.
- Any product-page renderer that maps `product_options.values` into select/radio/checkbox inputs.

I'll grep for `product_options` / `option.values` / `StructuredOptionValue` consumers during build and apply the filter at the render boundary only — pricing rules and snapshots are unaffected.

**4. Seed data (`src/lib/productOptionValues.ts`)**
- No functional change. Optionally add `is_active: true` explicitly for clarity in newly seeded values — existing rows in the DB remain valid because the field is optional.

### Out of scope
- No DB schema migration: `is_active` lives inside the existing `values` JSONB column.
- No bulk "disable all of group X" action — single per-row toggle only.
- Pricing rules, price overrides, and existing snapshots are untouched. If a customer has already selected a value that later gets disabled, their saved order keeps that selection (since it's snapshotted).

### Technical notes
- Filter uses `v.is_active !== false` so any legacy row without the flag remains visible.
- This is purely a presentation/filter change — no data migration, no consumer-breaking change.
