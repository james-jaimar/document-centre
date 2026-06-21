## Goal
Branch admin sets A2 Colour Simplex click to R50 in `rate_card_clicks` (scope `branch`), but the customer storefront for that same branch still prices A2 Colour at R45 (= master R40 + R5 paper). The branch override is being ignored.

## What I've already confirmed
- The branch row exists in DB:
  `rate_card_clicks` scope=`branch`, tenant=`c0000000-...-002`, branch=`93f5ba02-...`, size=`A2`, colour=`colour`, sides=`simplex`, sell_price=50, is_active=true.
- Master rows: A2/colour=40, A2/mono=20. So R45 on the page = master click (40) + paper (~5). The branch row is simply not being merged in.
- RLS policy `rate_card_clicks_branch_read` allows `anon` to read branch rows when `tenant_id = current_storefront_tenant_id()`.
- `useResolvedRateCardClicks` merges master → tenant → branch by `${size.toUpperCase()}|${colour}|${sides}`. Branch wins if its row is fetched.
- `OrderBuild.tsx` calls the resolved hook with `effectiveBranchId = activeBranch?.id ?? membershipBranchId`. So the customer is anonymous and depends entirely on `BranchContext.activeBranch.id`.

## Most likely root causes (to verify, in order)

1. **`effectiveBranchId` is null on the customer side** because `BranchContext.activeBranch` hasn't resolved (or doesn't equal the real branch UUID) at the moment the rate-card query fires.
2. **`x-storefront-tenant` header not attached** to the rate-card query, so RLS hides the branch row from anon (returns 0 rows, master silently wins).
3. **React Query cache hit** from before the branch override was created — the query key includes `branchId` so this only bites if (1) is also true at first load.

## Diagnosis steps

1. Open the customer storefront page in Playwright as anonymous, navigate to Posters config, and capture:
   - `window.__storefrontTenantId`
   - The Network tab entries for `rate_card_clicks?...&branch_id=eq.<id>` — confirm the request is made and what it returns.
   - The `branch_id` value embedded in that URL (or absence of the branch query entirely).
2. If the branch query never fires → `effectiveBranchId` is null → fix `BranchContext` so anon storefronts resolve `activeBranch` from URL/localStorage before children render pricing.
3. If it fires but returns `[]` → header/RLS issue → confirm `x-storefront-tenant` is on the request and matches the tenant on the row.

## Fix (decide after diagnosis)

- **If (1):** In `OrderBuild.tsx` (and any sibling configurators), gate the price calculation on `branchLoading === false`; or make `useResolvedRateCardClicks` accept and wait on a `ready` flag so we don't memoise a master-only result with `branchId=null`.
- **If (2):** Ensure the storefront header is published (`setStorefrontTenantId`) before the rate-card queries fire — likely a `useLayoutEffect` ordering fix in `TenantContext` / a `queryClient.invalidateQueries(['resolved_rate_card'])` on the `STOREFRONT_TENANT_EVENT`.
- **If (3):** Add the storefront tenant event to invalidate the `['resolved_rate_card', ...]` query keys.

Scope is limited to `src/contexts/BranchContext.tsx`, `src/hooks/useTenantContext.tsx`, `src/hooks/useResolvedRateCard.ts`, and `src/pages/dashboard/OrderBuild.tsx`. No DB or RLS changes anticipated (policies already allow the read).

## Verification

- Reload the customer Posters page; the A2 Colour line should price at R50 + paper (≈ R55) for the Test Branch and revert to R40 + paper on a different branch / no branch.
- Spot-check A2 Mono (should stay at master R20, no branch override exists → confirms master fallback still works).
