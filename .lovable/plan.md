# New Orders Badge — Reliable Auto-Refresh

## Problem
The sidebar "Orders" badge (`useNewOrdersCount`) didn't update when a new order landed — user had to refresh to see the count go from 2 → 3. A realtime subscription exists but clearly didn't fire (or fired before the row matched the filter: `admin_status='new_order'` AND `submitted_at IS NOT NULL`).

## Plan

1. **Add a 5-minute polling safety net** in `src/hooks/useNewOrdersCount.ts`:
   - `refetchInterval: 5 * 60 * 1000`
   - `refetchIntervalInBackground: false` (only poll when tab is visible — no wasted traffic)
   - `refetchOnWindowFocus: true` (instant update when user returns to tab)

2. **Make realtime more forgiving.** The current channel filters `branch_id=eq.<id>`. An order row is often first inserted as a cart (no `branch_id` or different status) and later UPDATEd on submit — the UPDATE payload's *new* row matches the filter, but Postgres CDC filters on the *old* row for some transitions. Switch to subscribing without the server-side filter and do the branch/tenant check client-side inside the handler before invalidating. Cheap: one branch runs one channel.

3. **Investigation step (no code change unless needed):** confirm via a quick read of `orders` for the missed order whether `branch_id` was set at INSERT vs later UPDATE. If it's set late, item 2 above is the actual fix; if it's set at INSERT, then realtime replication for that table isn't enabled and we'll enable it via migration.

## Out of scope
No changes to order submission logic, no new tables, no UI restyling.
