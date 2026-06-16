# Fix Presentations / A4 Landscape pricing

## Confirming your hunch — yes, this is the A4 Landscape change

You're right. The R 64.00 you're seeing is only covers + binding + tabs. **Click charges and paper are missing entirely.** Here's why:

### Root cause

`src/lib/calculatePrice.ts` (line ~475) reads the Document Size option and uppercases it:

```ts
const rawSize = spec.selected_options.size ?? spec.selected_options["Document Size"] ?? ... ?? "A4";
const size = String(rawSize).toUpperCase();  // → "A4-LANDSCAPE"
```

The new Presentations size option stores the slug `"a4-landscape"` (confirmed in migration `20260614084700_…`, seeded as `('a4-landscape','A4 Landscape',297,210,'A4','ISO',31)`).

That string then flows into two lookups that both fail silently:

1. **Click rate** — `resolveClickRate` searches `rate_card_clicks.size === "A4-LANDSCAPE"`. No row exists (rate card only has `A4`, `A3`, `SRA3`). It then tries the imposition parent via `SIZE_IMPOSITION["A4-LANDSCAPE"]` — also missing (map only has `A4`, `A5`, `A6`, `DL`). Returns `null` → **printing line skipped**.
2. **Paper** — `resolvePaper` builds `${code}-a4-landscape`, no match, then tries imposition parent — also missing. Returns `null` → **paper line skipped**.

So binding + covers + tabs render, printing + paper don't. Exactly the R 64.00 you're seeing.

### Scope check — does it affect anything else?

Only products whose Document Size option emits a `-landscape` (or future `-portrait` variant) slug. Today that's:

- **Presentations** — broken (this report).
- Bound documents, flyers, brochures, business cards, photo prints, posters — all still use the plain `a4` / `a3` / `sra3` / `dl` / pack-size slugs, so their pricing is unaffected.

If we ever add other `*-landscape` sizes (e.g. `a3-landscape`), they would hit the same bug. The fix below covers them all.

## The fix

In `src/lib/calculatePrice.ts`, normalise the size token before any rate-card lookup by stripping a trailing `-LANDSCAPE` / `-PORTRAIT` modifier. Landscape is an orientation, not a different price — A4 Landscape uses the same A4 paper and the same A4 click rate as portrait A4.

```ts
const size = String(rawSize)
  .toUpperCase()
  .replace(/-(LANDSCAPE|PORTRAIT)$/, "");   // "A4-LANDSCAPE" → "A4"
```

That single change makes:
- `resolveClickRate("A4", …)` find the existing A4 click row → derives from A3 parent via `SIZE_IMPOSITION.A4`.
- `resolvePaper("80gsm-bond", "A4")` build the correct `80gsm-bond-a4` paper code.
- The price breakdown popover show the Print + Paper lines again.

## File touched

- `src/lib/calculatePrice.ts` — one line, in the size-normalisation block (~line 482).

No DB migration, no rate-card edits, no other product affected.

## Verification after the change

1. Open a Presentations order with A4 Landscape selected → price should jump from R 64 to include per-page print + paper.
2. Open the Price breakdown popover → confirm "Print A4 Colour Duplex" and a paper line are listed.
3. Spot-check Bound Documents A4 portrait → price unchanged.
