## Goal

PostNet has the 3,266 SA postcodes mapped (at platform scope) but no methods, no rates, and only an empty tenant-level "Major Centre" zone with Bloemfontein. So `resolve_delivery_zone` returns a zone for any address, but `quote_delivery_rate` has nothing to price against → checkout shipping fails.

Seed PostNet with sensible defaults the tenant admin can then tweak per branch.

## What gets created (all at `scope_type='tenant'`, `tenant_id = PostNet`)

### 1. Clean up
- Delete the empty PostNet tenant-scoped "Major Centre" zone (`18e8a43d…`) and its single Bloemfontein city row. It currently shadows nothing useful but would mask the platform Major Centre zone for postcode lookups in Bloemfontein only. Removing it lets every address resolve against the platform postcode dataset.

### 2. Delivery methods (3)
| code | label | notes |
|---|---|---|
| `collection` | Collection from branch | free, flat R0 |
| `courier_standard` | PostNet Courier — Standard (2–3 days) | default fallback |
| `courier_express` | PostNet Courier — Overnight | ~1.6× standard |

### 3. Tenant fallback zone
- Add one tenant-scoped zone `outlying` / "Outlying & Remote" with `is_default_fallback = true`. Used when an address has no recognisable postcode/city (and the platform has no fallback).

### 4. Rates (weight tiers, ZAR)

Rates are written against the **platform zone IDs** for `major_centre` and `regional` (allowed — `quote_delivery_rate` doesn't require zone scope to match rate scope; it picks by rank with tenant rates winning over platform). Plus rates on the new tenant `outlying` zone.

Standard PostNet-style indicative pricing:

| Weight (kg) | Major Centre | Regional | Outlying |
|---|---|---|---|
| 0 – 1 | R 95 | R 130 | R 180 |
| 1 – 2 | R 115 | R 160 | R 220 |
| 2 – 5 | R 150 | R 210 | R 290 |
| 5 – 10 | R 210 | R 290 | R 390 |
| 10 – 20 | R 320 | R 430 | R 580 |
| 20 – 30 | R 450 | R 600 | R 800 |

- `courier_standard` uses the table above.
- `courier_express` = standard × 1.6, rounded to nearest R5.
- `collection` = single open-ended rate (0 – ∞ kg) at R0 against every zone.

That is 3 zones × (6 standard + 6 express + 1 collection) = **39 rate rows**.

### 5. Out of scope
- No UI changes — the existing Delivery editor already lists what we insert.
- No changes to the platform postcode dataset or to other tenants.
- No per-branch overrides — branch admins can override later via the existing branch delivery page.

## Technical notes

- Single migration: `DELETE` the empty zone + its location, `INSERT` methods, `INSERT` fallback zone, `INSERT` 39 rates in a CTE keyed by `(zone_code, method_code, tier_index)` resolving `zone_id` and `method_id` by lookup so it's idempotent and easy to re-run for other tenants later.
- All inserts scoped to `tenant_id = 'c0000000-0000-0000-0000-000000000002'`, `scope_type = 'tenant'`, `currency_code = 'ZAR'`.
- No schema changes, no RLS changes, no GRANTs needed.

## Confirm before I run

- Pricing table above — adjust any cell now, or accept as the starter set and tweak in the editor afterwards?
