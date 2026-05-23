# Tab Dividers — Pack pricing + fixed bank positions

Two related changes so the system matches how coloured tab dividers are physically sold and produced.

## 1. Sell in packs of 10 (pricing)

Today the Tab option offers 5 / 10 / 12 tabs and the customer pays per-tab. In reality, coloured PVC/card dividers ship in pre-cut **banks of 10** in a fixed colour sequence. A shop has to open (and charge for) a full pack even if the customer only wants 1 tab.

Changes:

- **Admin (`product_options.values` for the Tab option on bound families)** — replace the current 5 / 10 / 12 entries with **pack-based** values:
  - `1 pack (up to 10 tabs)`
  - `2 packs (up to 20 tabs)`
  - `3 packs (up to 30 tabs)`
  - … up to a sensible cap (e.g. 5 packs)
  - Each value's `metadata` stores `{ tab_count: <packs * 10>, pack_count: <packs>, color: "multi" | <single> }` and `price_impact` = pack price × packs (or per-pack via `price_type: "per_pack"` if we add it; simplest is per-pack flat multiplied at seed time).
- **Customer copy** — labels make it explicit: "1 pack — up to 10 tabs", with a helper line "Tab dividers are sold in packs of 10. You don't have to use all of them."
- **Order spec / pricing snapshot** — already keyed by selected option slug, so no schema change. `tab_count` semantics shift from "exact tabs" to "**maximum tabs available** in the chosen pack(s)".

No DB migration: this is a data edit on existing `product_options` rows. Seeder (`src/lib/seedBoundDocument.ts`) updated to match so fresh tenants get the same set.

## 2. Fixed bank positions (placement)

A pack of 10 has tabs at 10 pre-cut positions down the long edge. If the customer only uses 5 tabs from a pack of 10, they must either:

- take positions **1, 2, 3, 4, 5** (the first 5 in the pack), or
- **choose which physical slots** they want (e.g. 1, 3, 4, 7, 10) and discard the rest.

Today `TabManager`'s "Auto" evenly distributes N tabs across the document, implying tabs can sit anywhere on the page edge. That's wrong for pre-made banks.

New model — each placed tab carries **two** numbers:

- `sort_order` / `page_range_start` — where it sits in the page sequence (unchanged).
- `bank_position` (1–10 within its pack) — which physical pre-cut tab on the bank it is. Drives the vertical Y offset in preview, the colour (multi-colour cycle is position-based, not order-based), and the print-shop pick instruction.

Changes:

- **Schema** — add nullable `bank_position smallint` to `document_sections` (only meaningful when `section_type = 'tab'`). Migration + RLS unchanged.
- **TabManager UI** — for tab-limited products show a compact picker: a row of 10 slots per pack (greyed if used), customer clicks one to place. Each placed tab shows its bank position and physical colour swatch. Two helpers:
  - **"Use first N"** — auto-assigns positions 1..N to the placed tabs.
  - **"Distribute"** — keeps current behaviour (spaces tabs evenly across the body) but **snaps each to the nearest unused bank slot** rather than free Y positions.
- **Validation** — can't place two tabs on the same `bank_position` within the same pack; can't exceed `pack_count * 10` placed tabs total. Block "Add to Cart" with a clear message if violated.
- **Preview (`buildPreviewSnapshot` + `TabPosition`)** — Y offset for each tab face is derived from `bank_position / 10` of the page height (with the existing 30×50 protrusion model), not `tabIndex / tabTotal`. Colour also driven by `bank_position` so a tab pinned to slot 3 is always red, slot 4 always orange, etc., matching the physical pack.
- **Order snapshot / production** — `order_pricing_snapshots` and the job snapshot include `bank_position` per tab so the print operator gets an unambiguous "use tab 1, 3, 4, 7, 10 from the pack" instruction.

## Technical notes

Files touched:

```text
src/lib/seedBoundDocument.ts                 # pack-based Tab option values
src/components/order/TabManager.tsx          # bank slot picker, validation
src/components/order/TabInsertDrawer.tsx     # same bank picker in drawer
src/pages/dashboard/OrderBuild.tsx           # derive { packs, maxTabs, multiColor } from selected option
src/lib/orders/buildPreviewSnapshot.ts       # Y offset + colour from bank_position
src/lib/orders/buildJobSnapshot.ts           # surface bank_position to production
src/components/preview/previewTypes.ts       # TabPosition gains bankPosition
src/lib/pageCountRules.ts                    # (no change)
supabase migration                           # ALTER TABLE document_sections ADD COLUMN bank_position smallint
```

Existing tabs (rows where `bank_position IS NULL`) keep working — preview falls back to today's even-distribution mode. A one-off backfill assigns positions 1..N in document order so legacy carts render the same physical result.

## Out of scope

- Changing the colour cycle palette itself (still blue/red/orange/yellow/green ×2).
- Mixed-pack orders (e.g. one multi-colour pack + one all-blue pack). Single pack type per order item for now.
- Pricing per individual tab — pack flat price only.
- Re-imposition / production PDF changes beyond surfacing `bank_position` in the snapshot.

## Open questions

1. Pack price — same as today's "10 tabs" price, or a new value? I'll seed at the current 10-tab price unless you tell me otherwise.
2. Max packs to offer in the dropdown — 5 packs (50 tabs) enough, or go to 10?
3. Should "Use first N" be the default Auto behaviour, or keep "Distribute (snap to slots)" as default?
