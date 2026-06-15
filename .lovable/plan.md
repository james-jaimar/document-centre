## Goal
Make the customer configurator strictly honour each product option's `source` field, and ensure cover + binding catalogue values carry the metadata the preview engine needs.

## Principle
`product_options.source` is the single source of truth for where values come from:
- `source = "manual"` → use the option's saved `values` JSONB verbatim. No catalogue overlay, no enrichment, no name-based inference.
- `source = "catalog.sizes" | "catalog.papers" | "catalog.finishing"` → build values from the catalogue, respecting the per-product Enabled/Default toggles saved in `values`.

## Changes

### 1. `useCatalogBackedOptions` — source-driven branching
Replace the current "infer category from name" path with explicit source handling per option:

- If `source === "manual"`: return the option unchanged. Do not call `enrichFinishingValuesFromMaster`, `paperRowsToValues`, `sizeRowsToValues`, or any name-based fallback.
- If `source === "catalog.finishing"`: read category from `source_filter.category`. Enrich the saved values from master `catalog_finishing` (drop only when the master code no longer exists; honour per-product `is_active`/`is_default`/`price_impact`).
- If `source === "catalog.papers"`: project from master papers (cover-only when the option name maps to covers, else body papers), honouring saved Enabled/Default toggles.
- If `source === "catalog.sizes"`: project from master sizes via the resolved RPC + fallback, honouring saved Enabled/Default toggles.

Remove `inferFinishingCategoryFromName` from the customer overlay path entirely. Name-based heuristics are not used anymore — the admin's saved `source` decides.

### 2. Preserve admin Enabled/Default for catalogue-backed lists
Add a shared `applyAdminToggles(masterValues, savedValues)` helper in `optionAdapter.ts` used by papers/sizes/finishing catalogue branches:
- Match by `catalog_code` (or `slug`).
- Drop master entries that are not present in saved values when at least one saved value exists (admin curated the list); when saved values is empty, show full master list as a bootstrap.
- Overlay per-product `is_active`, `is_default`, `price_impact`, `price_type` onto the master row.

### 3. Cover + binding preview metadata
The preview engine reads `metadata.front`, `metadata.back`, `metadata.binding_method`, etc. Catalogue rows currently lack these. Add a deterministic mapping inside `optionAdapter.ts` keyed by `catalog_finishing.code` (and falling back to `variant`/`category`):

Cover codes → preview metadata:
- `acetate-cover` → `{ front: "clear_pvc", back: "white_card", front_thickness_micron: 200 }`
- `matte-pvc-cover` → `{ front: "matte_pvc", back: "white_card", front_thickness_micron: 200 }`
- `frosted-pvc-cover` → `{ front: "frosted_pvc", back: "white_card", front_thickness_micron: 300 }`
- `card-back-black` → `{ front: "white_card", back: "black_card" }`
- `card-back-navy` → `{ front: "white_card", back: "navy_card" }`
- `card-back` (250gsm generic) → `{ front: "white_card", back: "white_card", weight_gsm: 250 }`
- `card-cover-160 | 250 | 300` → `{ front: "white_card", back: "white_card", weight_gsm: 160|250|300 }`
- `silk-cover-250` → `{ front: "silk_card", back: "silk_card", weight_gsm: 250, finish: "silk" }`
- `gloss-cover-250` → `{ front: "gloss_card", back: "gloss_card", weight_gsm: 250, finish: "gloss" }`

Binding codes → preview metadata (from `variant` + category prefix):
- `comb-*` → `{ binding_method: "comb", size_mm: <variant>, color: "Black" }`
- `wire-*` → `{ binding_method: "twin_loop", size_mm: <variant>, color: "Silver" }`
- `spiral-*` → `{ binding_method: "spiral", size_mm: <variant>, color: "Black" }`
- `ring-binder-*` → `{ binding_method: "ring_binder", size_mm: <variant>, color: "Black", requires_hole_punch: true }`

These are merged into both `finishingRowsToValues` (bootstrap) and the enrichment path so catalogue-driven Covers/Binding selections drive the preview correctly.

### 4. Admin editor — keep `source` in sync when toggling back to Manual
In `ProductOptionsEditor`, when admin switches an option from `catalog.*` to `manual`, leave the saved values as-is (admin can then edit them). When switching from manual to catalog, the existing `refreshCatalogMirror` already rebuilds the mirror. No behaviour change here beyond what's needed for clarity.

### 5. Reset stale selections in `OrderBuild`
When the active option list no longer contains the previously-selected slug (because admin switched source/toggles), auto-select the default (or first active) value in local state so the customer doesn't see a stuck label.

## Verification
- Set Bound Documents → Covers to `manual`: customer dropdown matches the saved manual values exactly.
- Set it back to `catalog.finishing` (category `cover`): customer sees only admin-enabled catalogue covers; selecting Frosted/Matte/Acetate updates the preview (PVC overlay) and selecting card covers changes back-cover colour.
- Binding: selecting a comb/wire/spiral/ring-binder catalogue value flips the FlipBook preview type correctly via `binding_method`.