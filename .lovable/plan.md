## Problem

The customer `/orders` page is blank and the console shows:

> cannot add `postgres_changes` callbacks for `realtime:unread-msgs-customer-<uid>` after `subscribe()`

Root cause: `useUnreadMessagesCustomer` is now mounted twice on that page — once in the header (`MessagesBell`, added last turn) and once inside `CustomerOrders.tsx`. Both effects call `supabase.channel("unread-msgs-customer-<uid>")` with the **same topic**. Supabase's client de-duplicates channels by topic, so the second mount receives the already-subscribed channel and the follow-up `.on("postgres_changes", …)` throws. The thrown error unmounts the route → blank screen.

The same latent bug exists in `useUnreadMessagesStaff` (will fire the moment we mount a staff bell alongside `BranchOrders`).

## Fix

In `src/hooks/useUnreadMessages.ts`, give each hook instance its own channel topic so multiple subscribers can coexist:

- Generate a per-mount suffix (e.g. `useRef(crypto.randomUUID())` or `Math.random().toString(36).slice(2)`).
- Use it in the channel name: `unread-msgs-customer-${user.id}-${suffix}` and `unread-msgs-staff-${tenantId}-${branchId ?? "any"}-${suffix}`.
- Keep the existing cleanup (`supabase.removeChannel`) unchanged.

No schema, RLS, or RPC changes. Only this one file is touched.

## Verification

- Reload `/sandton-city/orders` as a customer with the bell visible → page renders, no "cannot add postgres_changes" errors.
- Bell badge still updates when staff posts a customer-visible message (realtime invalidation still fires on each channel).
- Branch portal `/branch/orders` continues to work (no regression for staff hook).
