

### Root cause

`src/App.tsx` creates the React Query client with no config:
```ts
const queryClient = new QueryClient();
```
React Query's defaults include `refetchOnWindowFocus: true` and `refetchOnReconnect: true`. That means every time you switch back to the browser tab, all active queries (orders, customers, settings, etc.) refire — UI flickers, in-progress edits in uncontrolled inputs can feel "lost", and it looks like a refresh. This affects both the preview and the published app because the same client config is used everywhere.

There are NO other auto-refresh culprits: no `visibilitychange` listeners, no polling `refetchInterval`, no `window.location.reload()` tied to focus (the only two `reload()` calls are explicit "Seed products" admin buttons, which are fine).

### Fix

Update the QueryClient construction in `src/App.tsx` to disable focus-driven refetches globally:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30_000, // 30s — avoids redundant refetches on quick remounts
      retry: 1,
    },
  },
});
```

That's the entire change — one block in one file. Because every hook in the app (`useOrders`, `useTenantCustomers`, `useCustomerAddresses`, etc.) inherits these defaults, this single edit kills the tab-focus refresh behaviour everywhere across customer, branch, admin, and platform portals.

### What stays the same
- Manual refreshes (the explicit "Seed" reload buttons, `queryClient.invalidateQueries(...)` calls after mutations) all keep working — those are explicit user actions, not focus-driven.
- Realtime subscriptions (if any) are unaffected.
- Auth session persistence is already correctly configured in `src/integrations/supabase/client.ts` (`persistSession: true`) — no change needed there.

### Verification
After the change: open the app in two tabs, edit a field, switch tabs, come back — the field/state remains, no flicker, no refetch spinner.

