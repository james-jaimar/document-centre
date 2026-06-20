## Wire posters to clicks + paper

### What you've done
- Added A2/A1/A0 simplex colour rows to `rate_card_clicks` (R 40 / R 80 / R 160).
- Stocked A3/A2/A1/A0 prices on `poster-paper-bond`, `premium-poster-paper`, `premium-poster-paper-gloss`, `photo-poster-gloss` in `catalog_papers` / `catalog_paper_prices`.

### Why the poster product doesn't see any of it

Two independent gaps:

**1. Click size lookup is case-sensitive (bug)**

`src/lib/calculatePrice.ts` `resolveClickRate` and `resolvePaper` compare `c.size === finishedSize`. `finishedSize` is upper-cased from the option slug (`"a2"` → `"A2"`), but the new click rows were stored lower-case (`a2/a1/a0`) while older rows are upper-case (`A3/A4/A5/A6/Letter/Legal`). Posters at A2/A1/A0 therefore never match → no click line item.

```
finishedSize = "A2"   row.size = "a2"   →   miss
finishedSize = "A3"   row.size = "A3"   →   hit
```

`SIZE_IMPOSITION` only knows about A4/A5/A6/DL → A3, so there's no parent fallback for A0/A1/A2 (correct — these are real bases now).

**2. Poster paper option slugs don't match catalogue paper codes (wiring gap)**

`PAPER_POSTER` in `src/lib/productOptionValues.ts` carries generic labels — "120gsm Silk", "200gsm Silk Card", "Photo Paper (Satin)" — whose auto-derived slugs (`120gsm-silk`, `200gsm-silk-card`, etc.) have no matching row in `catalog_papers`. `resolvePaper` builds `${slug}-${size}` (e.g. `120gsm-silk-a2`) and finds nothing → no paper line item. The catalog actually stocks `poster-paper-bond`, `premium-poster-paper`, `premium-poster-paper-gloss`, `photo-poster-gloss`.

### Fix

**A. `src/lib/calculatePrice.ts` — case-insensitive size compare (1 file, ~6 lines)**

- In `resolveClickRate`, compare `c.size.toUpperCase() === finishedSize` (already upper-cased) for both the direct lookup and the parent-imposition lookup.
- In `resolvePaper`, do the same against the size suffix (already lower-cased in `candidate`/`parentCode`) — the merged `code` from `useRateCardPapers` is built as `${paper.code}-${pp.size_code}` where `pp.size_code` is stored lower-case by the Master Catalogue editor, so it already matches; this is a belt-and-braces normalisation only.
- Strictly more permissive — no existing product regresses.

**B. Replace `PAPER_POSTER` with catalogue-aligned values (1 file in code + 1 admin data sync)**

Replace the five generic entries with one entry per real poster stock, whose slug **is** the `catalog_papers.code`:

| Label                          | Slug (must match `catalog_papers.code`) | Group     |
|--------------------------------|-----------------------------------------|-----------|
| Poster Paper (Bond)            | `poster-paper-bond`                     | Bond      |
| Premium Poster Paper (Satin)   | `premium-poster-paper`                  | Premium   |
| Premium Poster Paper (Gloss)   | `premium-poster-paper-gloss`            | Premium   |
| Photo Poster Paper (Gloss)     | `photo-poster-gloss`                    | Photo     |

This makes the price purely catalogue-driven: A2 silk paper just becomes `poster-paper-bond-a2` → resolved from `catalog_paper_prices`. Click charge resolves independently from `rate_card_clicks` for the chosen size + colour.

Because `productOptionValues.ts` only seeds *new* product families, existing posters in the DB keep their old option rows. A one-shot data sync is needed for the live posters product:

- Delete current "Paper Stock" values for the Posters family.
- Insert the four catalogue-aligned values (via the same Master Catalogue editor, OR a single SQL migration into `product_options` for the Posters family).

I'll propose the SQL once the plan is approved so you can review it before it runs.

### Out of scope
- `PRICING_POSTER` per_page rules (R 2.00 B&W / R 3.50 colour, R 25 setup) stay as-is — they layer on top of the rate-card lines. We can revisit whether the setup fee still makes sense once rate-card clicks are flowing.
- No changes to other products. Flyers/bound docs use the same paper code convention already.
- No new orientation behaviour (yesterday's landscape-canvas change still applies).

### Verification
1. Posters product, A2 size, colour, default paper → price line items show **A2 click (R 40)** + **Poster paper A2** + **per-page R 3.50** + **setup R 25**.
2. A1 + Premium Gloss → A1 click (R 80) + `premium-poster-paper-gloss-a1` (R 14.00) + per-page + setup.
3. A0 + Photo → A0 click (R 160) + `photo-poster-gloss-a0` (R 28.00) + per-page + setup.
4. A3 (still the default, no new rows) → no regression: existing A3 colour click row continues to resolve.
5. Other products (flyers, bound docs, business cards) — same prices as before.
