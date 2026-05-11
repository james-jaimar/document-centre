## Goal

Finish the rate card so it's fully editable everywhere, and add Photo Prints as a first-class pricing surface that mirrors the rest (master + tenant clone).

## 1. Click Charges tab — full CRUD + cost/active

Today: 8 fixed rows (A4/A3 × mono/colour × simplex/duplex), only `sell_price` editable.

Changes:
- Turn into a dynamic table. **Add row** dialog lets you pick `size` (free text — A4, A3, SRA3, A5, …), `colour`, `sides`. Uniqueness enforced per `(scope, tenant, size, colour, sides)`.
- Inline-edit `sell_price` and `cost_price` per row.
- `is_active` toggle per row.
- Row delete (with confirm).
- The 8 seeded rows stay; you can add SRA3, A5, etc.

DB: `rate_card_clicks.size` is already free text — no schema change needed. Add an `is_active` default and surface `cost_price` (column already exists). Drop the implicit "must be A4 or A3" check if one exists.

## 2. Photo Prints — new tab + new table

New table `rate_card_photo_prints` mirroring the others:

| col | notes |
|---|---|
| `id`, `scope_type`, `tenant_id` | same scoping pattern |
| `code` | e.g. `4x6-gloss`, unique per scope |
| `label` | "4×6\" Gloss" |
| `size_slug` | `4x6`, `5x7`, `6x8`, `8x10`, `a4`, custom |
| `width_mm`, `height_mm` | physical size |
| `finish` | `gloss` \| `matte` \| `lustre` (free text) |
| `border_mm` | 0 = no border |
| `sell_price`, `cost_price` | per print |
| `min_quantity` | optional, default 1 |
| `sort_order`, `is_active` | |

RLS: same pattern as the other rate-card tables (master read-all, platform admin writes master, tenant admin writes own clone). Extend `clone_master_rate_card_to_tenant()` to copy these rows too.

Seed master with the existing five sizes × {gloss, matte} × {no border, 3mm white border} = ~20 rows, prices from `src/lib/photoPrints/sizes.ts` as the starting point.

## 3. Editor UI

`RateCardEditor.tsx` gets a 4th tab **Photo Prints** with the same table + dialog pattern as Papers/Finishing:
- Columns: Code · Label · Size · Finish · Border · Price · Active · 🗑
- Add/Edit dialog with size preset picker (4×6, 5×7, 6×8, 8×10, A4, Custom) + finish + border + price.

Clicks tab gets:
- "Add row" button (size / colour / sides / sell / cost).
- Cost price column.
- Active switch column.
- Delete button per row.

## 4. Hooks & types

`src/hooks/useRateCard.ts`:
- New types `RateCardPhotoPrint`, `useRateCardPhotoPrints`, `useUpsertRateCardPhotoPrint`, `useDeleteRateCardPhotoPrint`.
- New `useInsertRateCardClick`, `useDeleteRateCardClick`, extend `useUpdateRateCardClick` to take `cost_price` and `is_active`.

## 5. Photo Prints recipe wiring (light touch, kept additive)

`PhotoPrintsBuilder` / pricing currently uses the hardcoded `PHOTO_PRINT_SIZES`. We add a thin lookup so when a tenant rate card has matching `size_slug + finish + border_mm`, the price comes from the rate card. Hardcoded list stays as a fallback so nothing breaks during rollout.

(Full recipe-driven rewrite of the photo prints builder UI is **out of scope** for this pass — flagged for a follow-up.)

## 6. Out of scope

- Branch-level photo print overrides
- Volume-discount tiers on photo prints
- Removing the legacy `PHOTO_PRINT_SIZES` constants

## Files

- migration: new `rate_card_photo_prints` table + RLS + seed + extend clone fn
- `src/hooks/useRateCard.ts` — new hooks, click CRUD extras
- `src/components/pricing/RateCardEditor.tsx` — new tab, click tab CRUD
- `src/lib/photoPrints/pricing.ts` (new) — small lookup that prefers rate-card price
- `src/components/order/PriceSummary.tsx` / `PhotoPrintsBuilder` — call the new lookup
