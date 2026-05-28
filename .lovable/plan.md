# Delivery engine — three correctness fixes

## Problem (verified)

For postcode **3624** with billable **1.00 kg**, checkout shows:

| Method | Shown | Source |
|---|---|---|
| PostNet2Door — Non-Express | R 185 | Major Centre platform, 0–2 kg |
| PostNet Courier — Standard | R 115 | Major Centre platform, 1–2 kg |
| PostNet Courier — Overnight | R 185 | Major Centre platform, 1–2 kg |

Three independent bugs explain why this disagrees with the tenant admin screenshot:

1. **`3624` is hard-listed under `Major Centre` (platform zone).** The resolver picks it before ever considering the tenant's `Outlying & Remote` zone. Today scope priority only kicks in when *multiple* zones match a location — a platform match still beats a tenant fallback.
2. **There is no tenant-level "disable method" mechanism the engine respects.** `PostNet2Door — Non-Express` is a platform-scope `delivery_methods` row with `is_active=true`. Toggling it off in admin must either be (a) deleting tenant rates (which we already do — Outlying has none) or (b) flipping a tenant override row. Neither is consulted: the engine pulls platform rates whenever the zone is platform-scope, so the method reappears.
3. **Tier boundary excludes the upper edge** (`billable < max_weight_kg`). At exactly 1.00 kg you get the 1–2 kg row instead of the 0–1 kg row. This contradicts how the admin UI labels the tier ("0–1") and how users intuit it.

## Fix

### 1. Tenant zones beat platform zones, always

Update `resolve_delivery_zone` so that **within the same `match_type` pass**, a tenant-scope zone with no matching location for the address but flagged as the tenant's default fallback should beat a platform-scope match. Concretely:

- After a platform postcode match succeeds, *also* check whether the tenant has any active zone for the country. If yes, prefer the tenant's matching zone (or its fallback) over the platform match.
- Equivalent simpler rule: do **scope pass first** (branch → tenant → platform), and within each scope do match_type priority (postcode → city → province → fallback). Only fall through to the next scope if the current scope yields nothing.

This means the demo tenant's `Outlying & Remote` (the tenant fallback) will be used for 3624 instead of Major Centre.

### 2. Per-tenant method enable/disable

Add a join table `tenant_delivery_method_overrides`:

```
tenant_id uuid, method_id uuid, is_enabled boolean, PRIMARY KEY(tenant_id, method_id)
```

- `quote_delivery_rate` and `listShippingQuotes` exclude methods where the tenant has `is_enabled = false`.
- Admin DeliveryTab: list every active platform + tenant method with a toggle. Toggling off writes a row with `is_enabled=false`; toggling on deletes the override (inherits platform default).
- This is the only switch the engine consults — no other hidden toggles.

### 3. Tier boundary is inclusive on `max_weight_kg`

Change the tier match in `quote_delivery_rate` from
`p_billable_kg >= min AND (max IS NULL OR p_billable_kg < max)`
to
`p_billable_kg >= min AND (max IS NULL OR p_billable_kg <= max)`.

This makes 1.00 kg use the 0–1 row — matching the labels in admin and what the user expects. The 1–2 row then covers (1, 2].

Also clamp the displayed/used weight at the `MIN_BILLABLE_KG = 1.0` we already enforce — no change there, just documenting.

## Files touched

- **Migration**: alter `resolve_delivery_zone`, alter `quote_delivery_rate`, create `tenant_delivery_method_overrides` + grants + RLS (tenant admins write, anon/auth read for resolved tenant).
- `src/lib/delivery/quoteShipping.ts` — `listShippingQuotes` joins the override table to drop disabled methods.
- `src/pages/admin/AdminDelivery.tsx` (or the closest equivalent) — add the per-method enable/disable toggle list.
- `src/integrations/supabase/types.ts` — regenerated.

## Out of scope

- Re-categorising `3624` (it's a small KZN postcode list issue; if 3624 should actually be Outlying, that's a data edit, not an engine fix).
- Changing the volumetric / per-item weight estimator.
- Free shipping threshold logic.

## After this, for the user's exact case

With 3624 + 1.00 kg, tenant `Outlying & Remote` resolves, Non-Express stays hidden (no tenant rate, and disabled at method level), and Courier Standard at 0–1 kg shows **R 180** (matching the admin screenshot). Overnight 0–1 kg = R 290.
