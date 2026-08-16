# North America readiness: imperial sizing, terminology and paper stocks

Goal: make the platform sellable into the US and Canada — imperial sizes, US print terminology, US/CA paper stocks in pounds, and a measurement system that follows the region with a tenant override.

## What I verified first

- Currency/region layer is already done: `platform_pricing_regions` has US (USD), CA (CAD), UK, EU, AU, ZA, and `useRegionalPricing` detects country via the `detect-region` edge function with a manual override.
- The storefront country picker (`src/lib/countries.ts`) still has **US and CA marked `available: false`** ("Coming soon").
- The master size catalogue (`catalog_sizes`, scope `master`) has only three US entries: `us-letter`, `us-legal`, `tabloid`. Everything else is ISO/metric plus square canvas sizes.
- There is **no measurement-unit concept anywhere** — no `measurement_unit` / `unit_system` setting in code or `tenant_settings`, and roughly 100 component files print millimetres directly.
- Size detection (`src/lib/paperSizes.ts`) recognises US Letter/Legal/Tabloid/Executive/Statement but always suggests an ISO A-series alternative, and business-card matching only has one US entry.
- Bleed handling is hard-coded metric: `BLEED_MIN_MM = 3`, `BLEED_MAX_MM = 15`, synthetic bleed `3 mm` in the PDF server resize path.
- The PDF server is millimetre-native throughout (`reportlab.lib.units.mm`, `width_mm`/`height_mm`/`bleed_mm` on every operation). It does not need to "understand inches" — it needs correct millimetre values converted from imperial, and a US bleed default of 3.175 mm (0.125").

## Plan

### 1. Units layer (foundation)

- New `src/lib/units.ts`: `UnitSystem = "metric" | "imperial"`, mm↔inch conversion, fractional-inch formatting (8.5 × 11", 5.5 × 8.5"), and a single `formatSize(widthMm, heightMm, unit)` helper.
- New `src/hooks/useMeasurementUnit.ts`: resolution order — tenant setting override → storefront region (US/CA → imperial, else metric) → metric. Uses the existing `resolve_tenant_setting` RPC and broadcasts like the region switcher does, so all live components update together.
- Tenant setting `measurement_unit` (`auto` | `metric` | `imperial`) added under an existing settings category, surfaced in tenant/branch settings UI.

### 2. Size catalogue — full North American set

Add master `catalog_sizes` rows with `region = 'US'` and correct millimetre dimensions:

- Documents: Letter 8.5×11, Legal 8.5×14, Ledger/Tabloid 11×17, Half-Letter 5.5×8.5, Executive 7.25×10.5.
- ANSI A–D (8.5×11, 11×17, 17×22, 22×34).
- Marketing: rack card 4×9, 4.25×6 and 4×6 and 5×7 and 6×9 and 6×11 (EDDM) postcards, 8.5×11 and 5.5×8.5 flyers, 12×18, 13×19.
- Posters: 18×24, 24×36, 27×40.
- Banners: 2×4 ft, 3×6 ft, 4×8 ft, plus US pull-up 33×80".
- US business card 3.5×2 (88.9×50.8) as a first-class catalogue size.

Landscape twins where the ISO sizes already have them. Existing tenant/branch clones stay untouched; a resync brings the new rows down when a tenant wants them.

### 3. Terminology and display

- `paperSizes.ts`: recognise the full US set, and when the active unit system is imperial, suggest the nearest **US** standard (Letter/Tabloid/Ledger) instead of A4/A3. Keep ISO suggestions for metric.
- Labels: sizes render as `Letter (8.5 × 11")` in imperial mode and `A4 (210 × 297mm)` in metric; job snapshots keep millimetres as the stored truth and format on display.
- Copy sweep across configurator, preflight advisories, imposition panel, job detail, quotes and invoices so mm-only strings run through `formatSize`.
- Spelling: US storefronts show "Color", "Catalog", "Customize"; SA/UK keep the existing SA English. Handled by a small term map keyed off the region, not a full i18n framework.

### 4. Paper stocks in pounds (US/CA)

- Add `weight_lb` and `lb_basis` (`text` | `cover` | `index` | `bond`) to `catalog_papers`.
- Seed the US/CA default stock list at master scope in pounds: 20lb Bond, 60/70/80lb Text, 80/100lb Gloss Text, 65/80/100lb Cover, 110lb Index, 14pt/16pt C2S.
- US storefronts show the pound label; metric storefronts keep gsm. Weight and shipping maths continue to use gsm internally (converted on seed), so `weightCalculation.ts` is unchanged.

### 5. Bleed and production

- Bleed becomes unit-aware: 3 mm metric default, 0.125" (3.175 mm) for US/CA products, with the existing per-job `bleed_mm` override preserved.
- Preflight near-size/bleed detection accepts the US bleed band so an 8.75×11.25" upload is read as Letter + 0.125" bleed rather than a custom size.
- PDF server: no engine change needed — it stays millimetre-native. I will confirm the resize path's synthetic 3 mm bleed becomes a caller-supplied value, and that imposition press sheets include US presses (12×18, 13×19, 19×13, 20×29) alongside SRA3.

### 6. Regions, storefront and rollout

- Flip US and CA to `available: true` in the country picker; verify `detect-region` returns US/CA correctly and that the region → currency → unit chain is consistent end to end.
- Product families: apply the new US sizes and imperial pricing rows across all families (flyers, business cards, posters, bound documents, loose sheets, photo, canvas, banners), one family per pass so pricing can be checked as we go.
- Full walkthrough at the end on a US-region demo store: upload → preflight → configure → price → cart → checkout → admin job → imposition → print-ready PDF, checking that every displayed dimension is imperial and every stored dimension is millimetres.

## Technical notes

- Millimetres remain the single stored unit everywhere (DB, snapshots, PDF API). Imperial is a presentation and input layer only — this avoids rounding drift in pricing and imposition.
- Schema changes: `catalog_papers.weight_lb`, `catalog_papers.lb_basis`, new `catalog_sizes` master rows, `tenant_settings` key `measurement_unit`.
- Sequencing: units layer and size catalogue first (steps 1–2), then display/terminology (step 3), then paper and bleed (steps 4–5), then per-family data and the walkthrough (step 6). Steps 4 and 6 are the largest data-entry pieces.
