
## What the audit found

Every tenant has branches with missing branch-scoped rows. Summary across 640 branches:

```text
tenant                 branches  stamped  miss_sizes miss_papers miss_paper_prices miss_fin_prices miss_product_links miss_zones
3 at 1                 77        1        76         76          76                76              77                 77
Document Centre Demo   1         0        1          1           1                 1               1                  1
Jetline                44        44       44         44          44                44              44                 44
PostNet SA             517       2        513        513         513               513             517                0
PrintWorx Cape Town    1         0        1          1           1                 1               1                  1
```

Key observations:
- `rate_card_clicks` and `branch_capabilities` are fully populated everywhere (their seed paths worked).
- **`catalog_sizes` / `catalog_papers` / `catalog_paper_prices` / `catalog_finishing_prices` / `product_catalog_links` / `delivery_zones` are missing on almost every branch.**
- Jetline has all 44 branches stamped `pricing_seeded_at` (so the trigger fired) yet none have catalog rows — the `clone_tenant_catalog_to_branch` call inside the trigger silently swallowed an error (wrapped in `EXCEPTION WHEN OTHERS THEN RAISE WARNING`) and the stamp went in regardless. The current `ensure_branch_pricing_seeded` short-circuits on `pricing_seeded_at IS NOT NULL` so it never retries these.
- The likely underlying cause on Jetline / 3 at 1 / PostNet is that `clone_tenant_catalog_to_branch` calls `user_can_manage_branch_catalog(p_branch_id)` and raises "Not authorised" when the trigger runs under a caller that doesn't yet have branch membership (e.g. bulk imports, activation flows). We will confirm during the fix.

So the answer to "does a new branch get everything?" is: **click charges yes, photo/business cards yes, capabilities yes — but sizes, papers, per-size paper/finishing prices, product↔catalog links, and delivery zones are silently missing on the vast majority of existing branches, and the same failure mode will hit future branches created via the same paths.**

## Plan

### 1. Harden the seeding functions

- Change `clone_tenant_catalog_to_branch` so the authorisation check is bypassed when called from the branch-insert trigger or from `ensure_branch_pricing_seeded` (both run as `SECURITY DEFINER`; the check adds no security here and blocks legitimate seeding). Keep authorisation on direct RPC calls from the UI.
- Change `ensure_branch_pricing_seeded` so instead of short-circuiting on `pricing_seeded_at`, it inspects each area and re-runs whichever clone is missing rows:
  - `catalog_sizes` empty → `clone_tenant_catalog_to_branch`
  - `rate_card_clicks` + `rate_card_photo_prints` + `rate_card_business_cards` empty → `clone_tenant_pricing_to_branch`
  - `branch_capabilities` empty → `seed_branch_capabilities`
  - `delivery_zones` (branch scope) empty → `clone_tenant_delivery_to_branch`
  - Then stamp `pricing_seeded_at = now()` if not already.
- Change `trg_clone_pricing_for_new_branch` to raise (not just warn) on catalog failure so we notice at insert time; keep other pieces individually wrapped so a downstream failure doesn't roll back the branch insert.

### 2. One-shot backfill for every branch missing anything

- Ship a `platform_backfill_branch_seeding()` maintenance function (SECURITY DEFINER, restricted to `platform_admin`) that loops every branch and re-runs the hardened `ensure_branch_pricing_seeded` logic.
- Invoke it once as data-fix from platform admin; the operation is idempotent (all clones are `WHERE NOT EXISTS`).

### 3. Verify

- Re-run the same summary query used in the audit; expect all `miss_*` columns to be 0 for every tenant.
- Spot-check one PostNet, one 3at1, one Jetline branch storefront and admin `/pricing` to confirm sizes/papers/prices resolve without falling back to master.

### Explicitly out of scope (already working)

- **Pack pricing (`product_pack_pricing_overrides`)** — resolves branch → tenant → master via `resolvePackPricing`, so absence at branch level is the correct default.
- **`rate_card_price_breaks`** — auto-seeded per rate-card row via `BEFORE INSERT` triggers.
- **`branch_catalog_overrides` / `branch_product_option_overrides`** — absence means "inherit".

## Technical detail

- Files touched: `supabase/migrations/<new>.sql` only (function replacements + maintenance function). No frontend code changes.
- No schema changes; only function bodies and a new platform-scoped maintenance RPC.
- `ensure_branch_pricing_seeded` return value semantics preserved (still returns `true` when it actually did work) so `useEnsureBranchPricingSeeded` cache invalidation still triggers appropriately.
