
# Pricing Overhaul — Master Rate Card

## Goal

Kill the per-product `pricing_rules` + `product_options` price impacts + `product_price_overrides` cascade. Replace with **one rate card** containing every priceable atom. Each product declares which rate-card items it consumes. Tenants get their own cloned rate card, seeded from the master, that they can edit freely.

## The Rate Card (single source of truth)

Three sections, all rows live in one logical "rate card" scoped to either the master (platform) or a tenant.

### 1. Click charges — 8-cell matrix
`size (A4|A3) × colour (mono|colour) × sides (simplex|duplex)` → unit price per impression.
- Stored as 8 rows so it's flat and visible in a table.
- Cost price column kept but optional (user de-prioritised).

### 2. Paper stocks
One row per `(name, weight_gsm, finish, size)`:
- e.g. "80gsm Bond A4", "135gsm Gloss A3", "350gsm Matt A4".
- `price_per_sheet` (sell), optional cost.
- Used by all paper-consuming products.

### 3. Finishing items — each declares its own pricing basis
Single table with a `pricing_basis` discriminator:

| Item | Basis | Example unit |
|---|---|---|
| Comb / Wire / Spiral binding | `per_unit` (by spine size) | per book |
| Saddle-stitch staple | `per_unit` | per booklet |
| Acetate cover | `per_sheet` (size-aware) | per cover |
| Card back | `per_sheet` | per cover |
| Lamination | `per_sheet` (size-aware: A4 / A3) | per side |
| Folding (brochures, leaflets) | `per_unit` | per piece |
| Guillotining (flyers) | `per_cut` or `per_unit` | per piece |
| Trimming (business cards) | `per_set` | per set of N |
| Ring binder | `per_unit` (by ring size) | per binder |

Each row: `code`, `label`, `pricing_basis`, `unit_price`, optional `size`, optional `variant` (e.g. spine size 6mm/8mm/10mm…), `is_active`.

## Product → Rate Card wiring

Each product family declares a small JSON "recipe" — which rate-card items apply and how:

```json
{
  "uses_click_charges": true,
  "default_paper_code": "80gsm-bond-a4",
  "available_papers": ["80gsm-bond-a4", "100gsm-bond-a4", "160gsm-card-a4"],
  "finishing": [
    { "code": "comb-binding", "required": true },
    { "code": "acetate-cover", "required": false },
    { "code": "card-back", "required": false }
  ]
}
```

The customer-side configurator reads the recipe, lets the user pick from `available_papers` and toggle optional finishing. Price = clicks (qty × pages × matrix cell) + paper (sheets × paper price) + finishing (per its basis).

## Tenant override model — Full Clone

On tenant onboarding (or first visit to `/admin/pricing`):
- Copy every master row into `tenant_rate_card_*` tables tagged `tenant_id`.
- Tenant admins edit their copy freely. No cascade, no merge.
- Branch override (Phase 2): same clone pattern down to `branch_id`. Out of scope for this pass — branch keeps the existing on/off toggle only.
- Platform admin "Push update from master" button per row (Phase 2) — not in this pass.

## Schema changes

**New tables**
- `rate_card_clicks` — `(scope_type, scope_id, size, colour, sides, sell_price, cost_price)`. `scope_type ∈ ('master','tenant')`.
- `rate_card_papers` — `(scope_type, scope_id, code, label, weight_gsm, finish, size, sell_price, cost_price, is_active)`.
- `rate_card_finishing` — `(scope_type, scope_id, code, label, pricing_basis, variant, size, sell_price, cost_price, is_active)`.
- `product_recipes` — `(product_family_id, recipe jsonb)`. One row per family.

**Dropped / deprecated**
- `pricing_rules` — drop after migration.
- `product_price_overrides` — drop.
- `product_options.values[].price_impact` — keep the column (options still exist for non-price config like orientation), but stop using it for pricing. Calculator ignores it.

**Snapshot preservation**
- `order_pricing_snapshots` continues to capture the resolved price at order time, so existing carts/orders are untouched.

**Functions**
- `clone_master_rate_card_to_tenant(p_tenant_id uuid)` — security-definer, called on tenant create / from `/admin/pricing` "Initialise" button.
- All RLS: master rows readable by everyone, writable only by `platform_admin`. Tenant rows writable by `user_is_tenant_admin(tenant_id)`.

## UI changes

**Platform `/platform/master-pricing`** — three tabs:
1. **Click Charges** — 8-cell editable grid (A4/A3 × Mono/Colour × Simplex/Duplex).
2. **Paper Stocks** — table with add/edit/delete.
3. **Finishing** — table grouped by category, with basis badge.

**Tenant `/admin/pricing`** — same three tabs, editing the tenant's clone. "Reset to master" per row.

**Tenant `/admin/products/:id`** — new "Recipe" tab: pick papers, toggle finishing items. Replaces today's pricing tab on the product editor.

**Branch `/branch/products`** — keep on/off toggle. Per-branch pricing deferred.

**Customer storefront** — `OrderBuild` reads recipe + tenant rate card; `PriceSummary` shows the three line groups (Print / Paper / Finishing).

## Calculator (`src/lib/calculatePrice.ts`)

Rewritten. New signature:
```ts
calculateItemPrice(spec, recipe, rateCard) → { lines, total }
```
Where `rateCard = { clicks, papers, finishing }` already scoped to the active tenant. No more rule-matching, no more cascade.

## Data migration

1. Migration creates the four new tables + RLS + clone function.
2. Seed master rate card from today's South African defaults (sensible click + common stocks + standard finishing) — done as INSERT data, separate from schema migration.
3. Auto-clone master to every existing tenant.
4. Drop `pricing_rules`, `product_price_overrides` after the new flow is verified in preview.
5. Existing orders unaffected (they use `order_pricing_snapshots`).

## Out of scope (for now)

- Branch-level rate card overrides
- "Push from master" diff/merge
- Multi-currency rate card (master stays ZAR; existing currency profiles can be reapplied later)
- Cost-side analytics

## Implementation order

1. Schema migration + clone function + RLS.
2. Seed master rate card with SA defaults.
3. Platform master-pricing UI (3 tabs).
4. Tenant pricing UI (3 tabs, edits clone).
5. `product_recipes` + product editor "Recipe" tab; backfill recipes for existing families.
6. Rewrite `calculatePrice.ts` + plumb into `OrderBuild` / `PriceSummary` / order snapshots.
7. Drop legacy tables + dead code paths.

Ready to build on approval.
