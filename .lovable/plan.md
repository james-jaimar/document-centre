## 1. Auto-seed products (capabilities) on new branches

**Current state:** `trg_clone_pricing_for_new_branch` already clones catalog + pricing on branch INSERT, and `ensure_branch_pricing_seeded` is the safety-net RPC on first render. But `branch_capabilities` (the rows that back "My Products") are **not** seeded automatically — they're only created when someone clicks the "Seed All Products" button, which calls `seed_branch_capabilities(branch_id)`. That's why Demo2 shows an empty "My Products" screen.

**Fix:**
- New migration that:
  1. Extends `trg_clone_pricing_for_new_branch` to also `PERFORM public.seed_branch_capabilities(NEW.id)` (wrapped in its own exception block, same style as the existing catalogue/pricing clones).
  2. Extends `ensure_branch_pricing_seeded(_branch_id)` to also call `seed_branch_capabilities` — so any branch that was created before this migration self-heals on first portal load (belt-and-braces, matches the existing pattern).
  3. Backfills every existing branch: `PERFORM public.seed_branch_capabilities(id) FROM branches` — Demo2 and any other empty branch get their capability rows immediately.
- Frontend (`src/components/branch/BranchProductToggles.tsx`, `src/pages/branch/BranchProducts.tsx`):
  - Remove the "Seed All Products" button from the **branch-owner** view — they should never see it. Keep it available in the **admin** view (`AdminBranchDetail.tsx`) as a maintenance tool.
  - Replace the empty-state ("No product capabilities configured yet") with a subtle loader that also fires `ensure_branch_pricing_seeded` and refetches, so if a branch ever lands on the page with zero rows, it self-heals silently.

## 2. Orders badge showing 1 instead of 2

**Verified current state:** Demo2 has two orders with `admin_status = 'new_order'`, both `submitted_at` set, both `app_id` set, both on the same branch. The `useNewOrdersCount` query filter (`admin_status = 'new_order'` + `submitted_at NOT NULL` + `app_id NOT NULL` + `branch_id = <demo2>`) should return 2, but the sidebar shows 1. **Root cause is unconfirmed** — I want to verify before "fixing".

Investigation steps (build phase):
1. From the branch-owner Playwright session, hit the same `count(head:true)` query the hook uses and read the number PostgREST returns — this tells us whether the under-count is RLS-side or client-side.
2. If PostgREST returns 2 → the badge component is rendering stale/cached data → check `useNewOrdersCount` and the realtime channel subscription lifecycle (channel key, `queryKey` stability).
3. If PostgREST returns 1 → RLS on `orders` is filtering one row. Check the branch-member SELECT policy against the two order rows and compare (customer_id, created_by, tenant/branch scoping) for any asymmetry.

Fix will follow the diagnosis:
- Client-side: correct the query-key / realtime channel so the count invalidates properly.
- RLS-side: tighten the policy so branch staff see every submitted order for their branch regardless of who created it.

## Out of scope
No changes to pricing, quoting, or the admin "Seed All Products" tool — this task is only about the new-branch empty state and the sidebar counter.
