## Problem

The Branch Pricing Rules page's "Re-sync from tenant" button calls `public.resync_branch_pricing_from_tenant`, which still references two retired tables — `rate_card_papers` and `rate_card_finishing`. Those were replaced by the `catalog_papers` / `catalog_paper_prices` and `catalog_finishing` / `catalog_finishing_prices` model (now managed via the separate **Catalogue Pricing** tab and its own `resync_branch_catalog_from_tenant` RPC). The DELETE on `public.rate_card_papers` blows up with `relation "public.rate_card_papers" does not exist`.

`clone_tenant_pricing_to_branch` has the same problem — it also INSERTs into both retired tables.

## Fix

Single migration that recreates both functions, dropping the legacy paper/finishing branches and keeping only what genuinely belongs to the Pricing Rules tab.

**`resync_branch_pricing_from_tenant(p_branch_id)`** — keep auth check unchanged; delete + repopulate only:
- `rate_card_clicks` (branch scope)
- `rate_card_photo_prints` (branch scope)
- `rate_card_business_cards` (branch scope)
- `pricing_rules` (branch-scoped)

Then `PERFORM public.clone_tenant_pricing_to_branch(p_branch_id)`.

**`clone_tenant_pricing_to_branch(p_branch_id)`** — drop the `rate_card_papers` and `rate_card_finishing` INSERT blocks; keep clicks, photo prints, business cards, and pricing_rules clone logic exactly as-is.

Paper & finishing pricing is intentionally out of scope for this RPC — that's what the Catalogue Pricing tab's "Re-sync from tenant" (already working via `resync_branch_catalog_from_tenant`) handles.

## Verification

After the migration, click **Re-sync from tenant** on `/t/postnet/branch/<test-branch>/pricing-rules`. Expected: toast success, list populates with the tenant's pricing_rules / clicks / photo prints / business cards.

No frontend changes required.
