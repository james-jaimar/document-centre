# Backfill TODO prices on the master rate card

## What needs filling

Current master rate card has **214 lines at R0.00 (TODO)**:
- **Clicks**: 16 of 24 (A5, A6, Letter, Legal — mono/colour × simplex/duplex)
- **Papers**: 110 of 122
- **Finishing**: 88 of 114

Every existing priced row stays untouched — this run only updates rows whose `sell_price = 0` and whose label contains `(TODO: price)`.

## Pricing rationale (the "reasoning trail")

I'll derive every price from one of three methods, and stamp the method into the rate-card `notes` column (e.g. `derived: A4 × 0.25 (A6 = 4-up)`) so the admin editor shows how each number was reached and you can override per row later.

### Method A — Area scaling (size)

A4 is the anchor. Multipliers based on imposition / sheet-area:

| Size | × A4 | Reasoning |
|---|---|---|
| A6 | 0.25 | 4-up on A4 |
| A5 | 0.55 | 2-up on A4, +10% handling |
| DL  | 0.40 | 3-up on A4, +20% handling |
| Letter | 1.05 | ~A4 area, US-stock premium |
| Legal | 1.30 | longer sheet |
| A3 | 2.00 | already in data — confirms the ratio |
| SRA3 | 2.30 | A3 + bleed, oversize click |
| A2 | 4.00 | 2 × A3 |
| A1 | 8.00 | 4 × A3 |
| A0 | 16.00 | 8 × A3 |

For clicks specifically: A3 mono simplex is R1.00 (= 2× A4 R0.50), which confirms the area ratio. Posters A2/A1/A0 will use the wide-format click rate (not the digital click line) — for those I'll set clicks at the A3 × area ratio but flag with `notes: wide-format estimate, verify`.

### Method B — Weight-linear scaling (paper gsm)

Anchors from existing data:
- 80gsm bond A4 = R0.20 → R0.0025 / gsm / A4 sheet
- 100gsm bond A4 = R0.30 → R0.0030 / gsm / A4 sheet
- 135gsm gloss A4 = R0.80 → R0.0059 / gsm
- 170gsm gloss A4 = R1.20 → R0.0071 / gsm
- 250gsm gloss A4 = R1.80 → R0.0072 / gsm
- 300gsm gloss A4 = R2.20 → R0.0073 / gsm
- 350gsm matt A4 = R2.80 → R0.0080 / gsm

Pattern: rate-per-gsm climbs as the stock gets heavier/coated. I'll fit a small step table per finish family:

| Finish family | R / gsm @ A4 |
|---|---|
| bond / uncoated | 0.0025 (80) → 0.0035 (120) |
| recycled | 0.0030 (80) — small premium |
| pastel (coloured 80gsm) | 0.0040 — speciality stock |
| silk / gloss (coated body 90–170) | 0.0060 |
| silk card / gloss card (200–350) | 0.0075 |
| photo satin | 0.0110 |
| kraft / cotton / triplex | 0.0090 |

Then **paper price = R/gsm × weight × size-multiplier (Method A)**. Size mult is identical to clicks.

### Method C — Anchored lookup (finishing)

These don't scale by area, so I'll set sensible per-unit prices benchmarked against the existing rows + standard SA print-shop rate cards I'll spot-check via web search.

| Bucket | Approach |
|---|---|
| Comb (19/32/38/51mm) | Interpolate the existing 6→25mm curve, extend linearly: ~R32 / R40 / R48 / R58 |
| Spiral (6/12/20/25/32mm) | Fit through R16@10, R22@16: R12 / R18 / R28 / R34 / R42 |
| Wire (6/16/22mm) | Fit through R18@8, R24@12: R14 / R28 / R34 |
| Ring binder (40/65/100mm) | Linear from 25→75: R55 / R75 / R95 |
| Lamination (A6/DL/A5/SRA3/A2/A1/A0, gloss/matt/soft-touch/encapsulated) | A4 gloss R8 / matt R9 × Method-A size mult; soft-touch +25%; encapsulated +60% |
| BC lamination | 0.05 × A4 = R0.50/card gloss, R0.60 matt, R0.80 soft-touch, R3.00 spot-UV |
| PVC covers (matte/frosted) | Match acetate: A4 R6 / A3 R12; frosted +R2 premium |
| Card covers (160/250/300gsm white/black/navy, silk/gloss card) | Use Method B paper price + R1 cut/finish surcharge |
| Folding | Bi R0.50 / Tri R0.80 / Z R0.80 / Gate R1.00 (existing curve) |
| Trimming (rounded corners 3mm/6mm) | R0.20 per corner × 4 = R0.80/sheet; 6mm same |
| Stapling (corner / double-edge) | R1.50 per doc (vs R3 saddle stitch) |
| Packaging (rubber band / shrink wrap) | R2 / R8 per doc — industry standard |
| Hole punching (2/3/4-hole) | R0.30 per doc |
| Tab dividers (white pack-of-10 / multicolour) | R35 / R55 per pack |
| Insert sheets (blank 80/160gsm, coloured) | = paper Method-B price + R0.20 handling |
| BC specials (foil gold/silver/rose, spot UV 1/2-side, emboss, deboss, edge paint, letterpress) | Foil R8/card; Spot UV R3/side; Emboss R5; Deboss R5; Edge paint R6/pack; Letterpress R10 |

### Web sanity-check

For the categories where I'm least confident (wide-format clicks, foil stamping, edge painting, soft-touch lamination), I'll do 3–4 quick web lookups against published South African price lists (Minuteman, Postnet, Print Lounge, Minuteman Press) to make sure my numbers are in the right order of magnitude. I'll cite the source in the `notes` column.

## Deliverables

1. **`/mnt/documents/rate-card-backfill.md`** — table of every TODO row with: current label, derivation method (A/B/C), formula used, source anchor(s), and the proposed price. So you can scan and veto before the migration runs.
2. **One `supabase--migration`** — `UPDATE` statements that:
   - Set `sell_price` for each of the 214 TODO rows
   - Strip the ` (TODO: price)` suffix from `label`
   - Write a `notes` value explaining the derivation (e.g. `derived: 0.55 × A4 R8.00 lamination (Method A)`, `derived: 0.0060 R/gsm × 120 × A4 (Method B)`, `web: avg of 3 SA shops (Method C)`)
   - Cost price left at 0 (you set margins per row)

Note: I'll need to add a `notes text` column to the three rate-card tables if it doesn't already exist — that's a tiny schema add, included in the same migration.

3. **No touching** of any row currently priced > 0, and no touching of tenant rate cards (they'll pull-from-master on demand as before).

## Open question

The wide-format poster sizes (A2/A1/A0) and the BC specialty finishes (foil, spot UV, emboss) are the categories where extrapolation is shakiest. Two options:

- **(a) Extrapolate them anyway** with `notes: estimate — verify` so they're visible in the editor and easy to filter for a price review.
- **(b) Leave them at R0.00 TODO** and only fill the categories where extrapolation is reliable (~170 of the 214 rows).

Default if you don't answer: **(a)** — fill everything, flag the shaky ones.