# Master rate-card coverage audit & gap fill

## What I found (preliminary scan)

The master catalogue has **11 product families** with **70 option groups** spanning hundreds of values. The master rate card currently holds:

- **Clicks**: 8 lines — A4 & A3 only (mono/colour × simplex/duplex)
- **Papers**: 12 lines — 80/100/135/170/250/300/350gsm in A4/A3 only, finishes limited to bond/gloss/matt
- **Finishing**: 25 lines — comb 6/10/16/25mm, spiral 10/16mm, wire 8/12mm, ring binder 25/50/75mm, lamination A4/A3 gloss/matt, acetate & card-back covers A4/A3, fold bi/tri/z, saddle stitch, guillotine flyer, business-card trim
- **Business Cards**: 2 lines
- **Photo Prints**: 7 lines

There are sizable coverage gaps. Below is the gap inventory grouped by rate-card domain, plus the proposed fill action. Pragmatic granularity per your answer — one rate-card line per pricing-relevant variant (e.g. one comb-size line covers all colours, but each paper finish×size×gsm needs its own line).

## Gaps to fill

### 1. Clicks (`rate_card_clicks`)
Sizes referenced by products but missing from clicks:
- **A5** (Bound Documents, Presentations, Ring Binders, Stapled Pages, Flyers)
- **A3 already covered** ✓
- **A2, A1, A0** (Posters)
- **SRA3** (Brochures, larger flyers)
- **US Letter, US Legal** (Bound, Presentations)
- **DL, A6** (Flyers)

→ Add mono/colour × simplex/duplex for each (4 rows per size).

### 2. Papers (`rate_card_papers`)
Body stocks referenced but missing:
- **90gsm Bond** A4 + A3
- **120gsm Uncoated** A4 + A3
- **80gsm Recycled** A4 + A3
- **80gsm Pastel** Blue / Green / Yellow / Pink (A4 + A3)
- **120 / 130 / 160gsm Silk** A4 + A3 (currently only 135gsm gloss)
- **130 / 160gsm Gloss** A4 + A3 (rate card has 135/170 — align names)
- **200gsm Silk Card** A4 + A3
- **250gsm Silk Card** A4 + A3, **250gsm Gloss Card** A4 + A3
- **300gsm Silk Card** A4 + A3
- Plus A5/SRA3/A2-A0 sizes for stocks used by Posters/Flyers/Brochures

### 3. Cover stocks (`rate_card_finishing` cat=cover)
Currently only acetate (clear PVC) + 250gsm card back. Missing:
- **Matte PVC** front A4 + A3 (200µ)
- **Frosted PVC** front A4 + A3 (300µ)
- **Card backs**: Black, White, Navy (250gsm) A4 + A3
- **160 / 250 / 300gsm white card** front+back sets
- **Silk / Gloss card** 250 / 300gsm front+back sets
- "Printed cover (uses body stock)" — flag as zero-charge passthrough

### 4. Lamination (`rate_card_finishing` cat=lamination)
Have: A4/A3 gloss & matt. Missing:
- **Soft Touch** A4 + A3 (Cover Lamination option exposes it)
- **Encapsulated both-sides** A4 + A3 (Page Lamination)
- Sizes for Posters: **A2, A1, A0** gloss + matt
- Sizes for Flyers/Brochures: **DL, A6, A5, SRA3** gloss + matt
- **Business-card** gloss / matt / soft-touch / spot-UV lamination

### 5. Binding (`rate_card_finishing` cat=binding)
Have comb 6/10/16/25mm, spiral 10/16mm, wire 8/12mm, ring binder 25/50/75mm. Missing/needed:
- **Spiral 6mm, 20mm, 25mm** (to cover 310-sheet max)
- **Wire 6mm, 16mm, 22mm**
- **Saddle stitch** is present ✓ (Booklets)
- **Ring Binder 100mm** if Ring Binders option includes it (need to verify the 8 binding values)
- Colour does **not** need its own line (pragmatic rule), but I'll add a note column noting "colour-neutral".

### 6. Bound-document finishing (`rate_card_finishing` cat=stapling/packaging)
Missing:
- **Corner staple** (top-left, top-right, double-left) — single per-document line
- **Collate & rubber band**
- **Shrink wrap per document**
- **Hole punching** (2-hole, 3-hole, 4-hole) — for Ring Binders & Stapled Pages

### 7. Tab dividers & inserts (new category)
No rate-card representation. Add:
- **Tab pack 10s — White** (per pack)
- **Tab pack 10s — Multi-colour** (per pack)
- **Blank slip sheet 80gsm white** (per sheet)
- **Blank slip sheet 160gsm card** (per sheet)
- **Coloured divider sheet** (per sheet)

### 8. Business Cards specials (`rate_card_finishing` cat=special)
The Special Finishing option has 8 values. Missing rate-card lines for:
- **Foil stamping** (gold / silver / rose-gold) per side
- **Spot UV** per side
- **Embossing / Debossing** per side
- **Edge painting** per pack
- **Rounded corners** (covered by trim? add explicit line)

### 9. Photo Prints
Already on dedicated `rate_card_photo_prints` — I will diff the Print Size values (4) against the 7 existing rows and only flag if a size is missing.

## Deliverables

```text
1. /mnt/documents/rate-card-audit.md
   - Full table: family · option · value · expected rate-card key · status (covered | MISSING)
   - One section per family for easy review

2. supabase migration (data inserts, not schema)
   - Inserts every MISSING line into the relevant rate_card_* table
   - scope_type='master', tenant_id=NULL, is_active=true
   - sell_price + cost_price = 0.00 (placeholder)
   - label suffix " (TODO: price)" so they're easy to find and edit in the editor
   - sort_order continues from current MAX(sort_order)+10 per category
```

## Approach

1. **Re-query** product options at full detail and dump to a working JSON (so I can match programmatically rather than eyeballing).
2. **Build matcher** keyed on `(category, size, variant, finish, weight_gsm)` for each rate-card table.
3. **Emit audit markdown** to `/mnt/documents/rate-card-audit.md`.
4. **Emit data-insert migration** with all gap rows, placeholder pricing, TODO label.
5. **Skim the resulting list** with you in chat before the migration runs.

## Notes / caveats

- I will **not** invent prices. Every new row is 0.00 with a `(TODO: price)` label suffix so the admin editor surfaces them immediately for you to fill in.
- I will **not** delete or modify any existing rate-card row.
- Tenant rate cards are unaffected — they only re-clone from master on demand.
- The audit treats "pragmatic" coverage as: paper = (finish × weight × size), lamination = (finish × size), binding = (method × size band), cover = (material × size), click = (size × colour × sides). Colour/brand variants of the same physical product don't get separate lines.

Ready to switch to build mode and run this end-to-end?
