## Goal
Make binding spine selection conservative so we never under-size a spine. Two changes:
1. Reduce every spec's effective capacity by **15%** (covers, slight over-stuffing headroom).
2. Count each **tab divider as 2 sheets** when computing the sheet count used to pick the spine.

## Where this lives
`src/lib/calculatePrice.ts` — `calculatePriceFromRateCard`, the block that picks the binding spine via `rc.bindingSpecs`.

Today it does:
```ts
.find((s) => totalSheets >= s.min_sheets && totalSheets <= s.max_sheets_80gsm)
```
where `totalSheets` = sum of clicks across printable sections.

## Changes

### 1. Conservative capacity (15% headroom)
When matching a binding spec, compare against `floor(max_sheets_80gsm * 0.85)` instead of the raw max:
```ts
const effectiveMax = Math.floor(spec.max_sheets_80gsm * 0.85);
return bindingSheets >= spec.min_sheets && bindingSheets <= effectiveMax;
```
Net effect: the engine jumps to the next-larger spine sooner. Covers/upgrades absorbed automatically.

### 2. Tabs count as 2 sheets each
Compute a separate `bindingSheets` figure (used **only** for spine selection — not for clicks or paper billing):
```ts
const tabCount = spec.sections?.filter(s => s.label?.toLowerCase().includes("tab")).length ?? 0;
const bindingSheets = totalSheets + tabCount * 2;
```
Then feed `bindingSheets` (not `totalSheets`) into the spec lookup and the rate-card row picker.

Tab detection: today insert/tab sections live in `spec.sections` with a label. I'll confirm the exact label convention by reading `src/lib/orders/sectionOrdering.ts` and the bound-document builder before writing the code so the filter is reliable (likely `section.label` of `"Tab"` / `"Insert"`, or a `kind` field — will use whichever is canonical).

### 3. Nothing else changes
- Click charges, paper rows, n-up imposition, saddle-stitch/perfect-bind branches: untouched.
- `price_impact` fallback: untouched.
- No DB or recipe changes.

## Verification
- 4-sheet A4 colour duplex, wire binding → still picks the same small spine if 4 ≤ 85% of its max; otherwise bumps up by one. Total recomputed and reported.
- Same job + 3 tab dividers → `bindingSheets = 4 + 6 = 10`, picks a larger spine.
- Edge: when `bindingSheets` exceeds every spec's `effectiveMax`, fall back to the largest spec (and largest rate-card row) instead of returning nothing — prevents silent zero binding.

## Files touched
- `src/lib/calculatePrice.ts` (single function)
