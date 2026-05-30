## What I checked

The Orders list is **not** waiting on Supabase Postgres — I ran the underlying query and it returns in ~8 ms (48 orders total, RLS policies eval fast). It's also not the edge functions (none are called on this page). The slowness is on the **client / PostgREST round-trip** side. Three concrete causes:

### 1. Two parallel `useAdminOrders` calls with different cache keys
`src/pages/branch/BranchOrders.tsx` calls the hook twice:
- Once with the user's filters
- A second time with `page_size: 1` purely to compute `totalForBranch` for the empty-state hint

Because the `filters` object differs, React Query treats them as two queries — both fire on every mount and on every filter change. On a cold load that's 2 sequential PostgREST requests competing on the same HTTP/2 connection, each carrying `Prefer: count=exact`.

### 2. `count: "exact"` on every fetch (`src/lib/orders/queries.ts`)
`count: "exact"` forces PostgREST to run a second `SELECT count(*)` with full RLS evaluation on every request. We only need a real count when paginating. Switching to `count: "planned"` (or only requesting it on page 1 / when total is unknown) typically cuts latency in half.

### 3. The list query pulls `order_jobs.configuration` (JSONB)
The table view never renders `configuration`, but we select it. On the branch's 42 jobs that's ~95 kB transferred per request — and PostgREST serialises JSONB row-by-row. Dropping it from the select shrinks the payload and the parse time.

### Secondary contributors (not blocking, but worth noting)
- `useUnreadMessagesStaff` opens a realtime websocket on mount; the handshake can add ~300–800 ms but doesn't block the table render.
- `TenantContext` resolves `tenantId/branchId` before `enabled: !!tenantId` lets the query fire, so the spinner you see includes that membership lookup.
- No `staleTime` set on `useAdminOrders` → every navigation back to /branch/orders refetches.

---

## Plan

**A. `src/pages/branch/BranchOrders.tsx`**
- Remove the second `useAdminOrders({…, page_size: 1})` call. Derive `totalForBranch` from `data?.total` when there are no active filters; only show the "X total orders for this branch" hint in that case.
- Memoise the `filters` object with `useMemo` so the query key is stable across re-renders.

**B. `src/lib/orders/queries.ts` — `fetchAdminOrders`**
- Change `{ count: "exact" }` → `{ count: "planned" }`. Keep `total` returned the same way (planned count is close enough for "Page 1 of N").
- Drop `configuration` from the `order_jobs(...)` embed. (The detail page already fetches it via `fetchOrderDetail`.) Keep `job_number, sequence_no, product_name, product_category, job_name, job_status, customer_job_status, proof_status, file_status, urgency, quantity, unit_label, net_price, gross_price, created_at` — those are all the table actually reads.
- Same treatment for `fetchCustomerOrders` (drop `configuration` from the embed).

**C. `src/hooks/useOrders.ts`**
- Add `staleTime: 15_000` and `gcTime: 60_000` to `useAdminOrders` and `useCustomerOrders` so re-entering the page from the order detail view is instant.

**D. Verify**
- Reload `/branch/orders` with DevTools network panel open and confirm:
  - Only **one** request to `/rest/v1/orders` (was two).
  - Response size drops noticeably (configuration removed).
  - `Prefer: count=planned` header sent.
  - Returning from an order detail back to the list shows cached data instantly.

### Out of scope
- No DB index changes — query plan is already fast on this volume.
- No RLS policy changes — they're not the bottleneck at 48 rows.
- No layout/visual changes to the Orders page.

If after these three changes the page still spins for ~10 s, the next thing to look at is auth/membership resolution before `tenantId` is available — I'd add a perf mark inside `TenantContext` to confirm.