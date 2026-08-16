# Separate metric and imperial catalogues

Split the master catalogue into two self-contained lists — Metric and Imperial — so nobody ever sees mixed units, and a North American tenant only ever works with imperial data.

## What exists today

- `catalog_sizes`, `catalog_papers`, `catalog_finishing`, `catalog_print_attrs` all carry `scope_type` (master / tenant / branch) and are cloned master → tenant → branch by `clone_master_catalog_to_tenant` and `clone_tenant_catalog_to_branch`.
- Only `catalog_sizes` has a `region` column (values `ISO`, `US`, or null). Papers, finishing and print attributes have no region or unit field at all — the imperial data added last time only landed on sizes.
- Master counts today: 47 sizes (20 ISO, 27 US, 4 untagged), 42 papers, 101 finishing, 8 print attributes.
- Finishing already carries unit-bearing data: `size_mm` on every comb/wire/spiral/ring item, and gsm in cover and insert labels.
- The tenant unit preference already exists: Settings → Financial → Measurement Units (`regional.measurement_unit`, values auto / metric / imperial), resolved by `useMeasurementUnit`.

## The model

Every catalogue row gets a `unit_system` of `metric` or `imperial` — no shared rows, two complete parallel lists as requested. Print attributes (colour, sides, orientation) are the one genuinely unitless catalogue and stay single-list.

Even where an item is unit-neutral (lamination, folding, stapling, trimming, packaging), the imperial list gets its own row with an `-in` code suffix, so an imperial tenant's catalogue is complete on its own and can be priced independently in USD/CAD without touching metric rows.

```text
master
 ├── metric   : sizes(ISO) · papers(gsm) · finishing(mm)   ← existing rows
 └── imperial : sizes(US)  · papers(lb)  · finishing(inch) ← new rows
        │
        └── tenant clone: ONLY the tenant's unit system
                │
                └── branch clone: inherits, branch may override the unit
```

Cloning only the active unit system down to tenant and branch matters: there are already ~65,000 branch finishing rows: duplicating both lists everywhere would double that for no benefit.

## Steps

### 1. Schema

- Add `unit_system` (`metric` | `imperial`, default `metric`, not null) to `catalog_sizes`, `catalog_papers` and `catalog_finishing`.
- Backfill: sizes with `region = 'US'` → imperial, everything else → metric.
- Add `unit_system` to the uniqueness keys so a metric and imperial row can share a base concept without code collisions.
- Add `size_in` (numeric) to `catalog_finishing` alongside `size_mm` for binding diameters, and keep `weight_lb` / `lb_basis` on papers as the imperial truth.
- Branch-level unit override: new branch setting `regional.measurement_unit` read ahead of the tenant value in `useMeasurementUnit`.

### 2. Seed the imperial master list (US/CA starter set)

- Sizes: the 27 US rows already inserted become the imperial list as-is.
- Papers: 20lb Bond, 60/70/80lb Text, 80/100lb Gloss Text, 65/80/100lb Cover, 110lb Index, 14pt/16pt C2S — each with the gsm equivalent stored for weight and shipping maths.
- Finishing, imperial equivalents by category:
  - Binding: comb 1/4", 5/16", 3/8", 1/2", 5/8", 3/4", 1", 1.5", 2"; wire 1/4", 5/16", 3/8", 1/2", 5/8", 7/8"; coil 1/4" – 1.25"; ring binders 1", 1.5", 2", 3".
  - Cover: 65lb / 80lb / 100lb Cover, 14pt / 16pt gloss and silk, printed-cover variants.
  - Inserts: 20lb Bond slip sheet, 65lb Cover slip sheet.
  - Trimming: rounded corners 1/8", 1/4".
  - Generic categories (collating, folding, guillotine, hole punching, lamination, packaging, special, stapling, tab dividers) get a mirrored imperial row each, same labels, imperial codes, priced separately.

### 3. Platform master catalogue UI

- A Metric / Imperial segmented switch at the top of `/platform` → Catalogue. It filters Sizes, Paper and Finishing; Print Attributes is shown as shared and unaffected by the switch.
- New rows inherit the active tab's unit system; the create/edit dialog shows mm+gsm fields in metric and inch+lb fields in imperial.
- A "Copy to imperial" / "Copy to metric" action on a row to seed the twin without retyping.

### 4. Tenant and branch surfaces

- Tenant settings keep the existing Measurement Units control; it now also decides which master list clones down.
- Branch settings gain the same control with an "Inherit from tenant" default.
- Tenant Specs and Branch Specs dialogs, product catalogue links, pack pricing, variant pricing and rate cards all filter to the resolved unit system — a US branch never sees an A4 row or a gsm stock.
- Resync actions (`resync_tenant_catalog_from_master`, `resync_branch_catalog_from_tenant`) pull only the matching unit system; switching a tenant's unit offers a one-click reseed into the other list rather than silently mixing.

### 5. Storefront and production

- The configurator reads whichever list the branch resolved to, so labels are already native (`Letter (8.5 × 11")`, `100lb Cover`, `1/2" comb`) with no runtime string rewriting.
- Millimetres and gsm remain the stored truth on every row, so the PDF engine, imposition, weight and shipping maths are untouched.

## Technical notes

- Migration order per table: add column → backfill → drop/recreate unique index including `unit_system` → update the three clone functions and both resync functions.
- Clone functions gain a unit filter derived from the tenant's (or branch's) resolved `regional.measurement_unit`, defaulting to metric for every existing tenant so nothing changes for current customers.
- `src/lib/units.ts` keeps the conversion helpers; the `localiseLabel` regex rewriting becomes a fallback for legacy rows only, since labels are now authored per unit.
- No changes to `catalog_print_attrs`, pricing engine internals, or the PDF API contract.
