
# Pricing Architecture Overhaul

## The Core Question: Centralised vs Product-Level Pricing

**Current state:** We have a dual-layer system:
1. `pricing_rules` table — centralised base rates (per-page B&W/colour, setup fees, volume discounts) scoped per product family
2. `product_options` — structured values with `price_impact` fields for binding, lamination, tabs, inserts, hole punching, finishing, etc.

**What PrintJob/Impress does (your screenshots):** A pricing matrix per product — you define parameters (Quantity, Size, Sides, Lamination, Paper, Edge), then the system generates a Cartesian product of every combination, each with a Sell Price, Cost Price, and Weight.

**Recommendation: Keep our centralised model, but add a product-level override layer.**

The Impress approach (full Cartesian matrix) is powerful but brutal — for Business Cards alone with 6 parameters, you get hundreds of rows that each need a price. For smaller shops, that's overwhelming. Our approach (rules + option impacts) is more manageable and still accurate.

However, tenants need the ability to override specific combinations at the product level. Here is the proposed hybrid:

```text
Layer 1: pricing_rules (base rates, volume discounts — as today)
Layer 2: product_options.price_impact (option surcharges — as today)
Layer 3: NEW product_price_overrides (tenant overrides for specific combos)
```

A tenant could say "for Business Cards, 90x50mm, Double Sided, Gloss Lamination, 350gsm Gloss — the price is R450 flat for 250" and that override wins over the calculated price.

---

## Phase 1: Binding Capacity Reference Data

Create a `binding_specifications` reference table with industry-standard data:

| Binding Method | Size (mm) | Pitch | Max Sheets (80gsm) | Min Sheets |
|---|---|---|---|---|
| Comb | 6 | 19-hole | 25 | 2 |
| Comb | 10 | 19-hole | 55 | 10 |
| Comb | 12 | 19-hole | 90 | 30 |
| Comb | 16 | 19-hole | 130 | 50 |
| Comb | 19 | 19-hole | 150 | 80 |
| Comb | 22 | 19-hole | 180 | 100 |
| Comb | 25 | 19-hole | 220 | 120 |
| Comb | 32 | 19-hole | 280 | 160 |
| Comb | 38 | 19-hole | 340 | 200 |
| Comb | 45 | 19-hole | 400 | 250 |
| Comb | 51 | 19-hole | 450 | 300 |
| Wire 3:1 | 6.4 | 3:1 (34-loop) | 25 | 1 |
| Wire 3:1 | 8 | 3:1 | 45 | 15 |
| Wire 3:1 | 9.5 | 3:1 | 65 | 25 |
| Wire 3:1 | 11 | 3:1 | 90 | 40 |
| Wire 3:1 | 12.7 | 3:1 | 110 | 60 |
| Wire 3:1 | 14.3 | 3:1 | 120 | 75 |
| Wire 2:1 | 16 | 2:1 (23-loop) | 135 | 90 |
| Wire 2:1 | 19 | 2:1 | 160 | 100 |
| Wire 2:1 | 22 | 2:1 | 190 | 120 |
| Wire 2:1 | 25.4 | 2:1 | 220 | 140 |
| Spiral Coil | 6 | 4:1 | 15 | 1 |
| Spiral Coil | 8 | 4:1 | 30 | 5 |
| Spiral Coil | 10 | 4:1 | 50 | 15 |
| Spiral Coil | 12 | 4:1 | 75 | 30 |
| Spiral Coil | 14 | 4:1 | 100 | 45 |
| Spiral Coil | 16 | 4:1 | 120 | 60 |
| Spiral Coil | 20 | 4:1 | 160 | 80 |
| Spiral Coil | 25 | 4:1 | 200 | 110 |
| Spiral Coil | 30 | 4:1 | 250 | 140 |
| Saddle Stitch | — | — | 40 (printed pages) | 4 |

The existing binding option metadata (`max_sheets`) stays, but now we have a reference table tenants can use to auto-populate their options and validate page counts at order time.

Tenants configure which binding sizes they stock — the system validates page count against the selected binding's capacity and auto-suggests the right size.

---

## Phase 2: Product Price Override Table

New table `product_price_overrides`:
- `tenant_id`, `product_family_id`
- `conditions` JSONB — the option combination (e.g. `{"size": "90x50mm", "sides": "double", "lamination": "matt", "paper": "350gsm-matt", "edge": "round-corners"}`)
- `quantity_min`, `quantity_max`
- `sell_price`, `cost_price`
- `weight_grams` — for shipping calculation

This gives tenants the PrintJob-style matrix capability without forcing it. They can enter overrides for common combinations, and the calculator falls back to rules + options for everything else.

---

## Phase 3: Ancillary Services Pricing

Currently tabs, inserts, hole punching, and finishing have `price_impact` values baked into the option values. This works but doesn't let tenants easily adjust prices without editing the structured JSON.

Proposal: Add a **Services** pricing section within each product family's admin page. This surfaces the option price impacts in an editable table format:

| Service | Price | Per | Notes |
|---|---|---|---|
| 2-Hole Punch | R0.02 | page | |
| 4-Hole Punch | R0.02 | page | |
| 5-Tab White | R8.00 | set | |
| 10-Tab White | R14.00 | set | |
| Staple Top-Left | R0.50 | document | |
| Shrink Wrap | R3.00 | document | |
| Acetate Front Cover | — | document | **MISSING — needs adding** |
| Black Card Back | — | document | **MISSING — needs adding** |
| White Card Back | — | document | **MISSING — needs adding** |
| Trimming/Guillotine | — | document | **MISSING — needs adding** |

The UI writes back to `product_options.values[].price_impact`, so no schema change needed — just a better editing experience.

---

## Phase 4: Weight & Shipping Estimation

### Paper Weight Formula
Weight per sheet = (width_mm x height_mm x gsm) / 1,000,000 grams

For a 200-page A4 document on 80gsm bond:
- Per sheet: (210 x 297 x 80) / 1,000,000 = 4.99g
- 100 sheets (200 pages duplex): ~499g
- 20 copies: ~9.98kg

### Reference Data
Add paper weight metadata to Paper Stock options (already have `weight_gsm` on some). Add cover weights. The system can then calculate:
- Total print weight = (sheet_count x sheet_weight) + cover_weight + binding_weight
- Packaging overhead: ~5-10% addition
- Volumetric weight: length x width x height / 5000

### Shipping Integration
Rather than building a full shipping calculator immediately, add a `weight_grams` computed field to order items and expose it in the admin order view. This gives production staff the weight for courier quoting. A proper courier API integration (e.g. The Courier Guy, Aramex SA) can follow later.

---

## Phase 5: Product-Level Pricing UI

Move pricing configuration into the product family admin page (like PrintJob does), while keeping the centralised Pricing Rules page as the "global defaults" view.

Each product family's admin page gets a **Pricing** tab with:
1. **Base rates** — inherited from global rules, with override toggles
2. **Option prices** — editable table of all option surcharges
3. **Combination overrides** — optional matrix for specific combos (Phase 2)
4. **Binding calculator** — for bound products, shows capacity constraints

---

## Implementation Order

Given the scope, I'd suggest phasing this:

1. **Binding capacity reference table + validation** — immediate value, prevents impossible orders
2. **Missing cover/service options** (acetate covers, card backs, trimming) — fills pricing gaps
3. **Product-level pricing UI tab** — surfaces existing data in a more intuitive location
4. **Price override table** — for tenants who need exact combo pricing
5. **Weight calculation engine** — for shipping estimation
6. **Shipping/courier integration** — later phase

### Technical changes

**Database migrations:**
- `binding_specifications` reference table (seeded with industry data)
- `product_price_overrides` table
- Add `weight_grams` column to `order_items`

**UI changes:**
- Product family admin: new Pricing tab with editable option prices and override matrix
- Order builder: binding capacity validation (auto-suggest correct size)
- Order detail: computed weight display

**Seed data:**
- Binding capacity data for comb, wire, spiral, saddle stitch
- Missing option values: acetate covers, card backs, trimming service
- Paper weight metadata on existing stock options

This keeps our architectural advantage (centralised rules) while giving tenants the granular control they need. Want me to proceed with Phase 1 (binding specs + validation) first?
