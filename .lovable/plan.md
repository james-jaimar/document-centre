

# Fix: "Add to Cart" not updating status/price + navigation guard not working

## Two issues

### Issue 1: "Add to Cart" appears to not work
The `handleAddToCart` function calls `handleSave()` first (which updates the spec), then calls `confirmItem.mutateAsync()` which updates status to "quoted" and saves the price. The code looks correct structurally, but the `handleSave` call doesn't `await` properly — it catches errors internally with `toast.error` and returns `undefined` even on failure. If `handleSave` fails silently, `confirmItem` still runs but may use stale data. Additionally, the query invalidation uses `["orders"]` but the orders list queries with `["all_orders", userId]` — so the list doesn't refresh after confirmation.

**Fix**: 
- In `useConfirmOrderItem`'s `onSuccess`, also invalidate `["all_orders"]` to refresh the orders list
- Ensure `handleAddToCart` propagates errors correctly

### Issue 2: Navigation guard only works on "Back to Files" button
The save/reference dialog only triggers when clicking the "Back to Files" button. Clicking sidebar links, browser back, or any other navigation bypasses it entirely.

**Fix**: Use react-router-dom v6's `useBlocker` hook to intercept ALL navigation attempts when `dirty` is true. This catches sidebar clicks, browser back, and any programmatic navigation.

## Changes

### File: `src/pages/dashboard/OrderBuild.tsx`
1. Import `useBlocker` from react-router-dom
2. Replace the manual `handleBackToFiles` guard with `useBlocker(() => dirty, [dirty])`
3. When `blocker.state === "blocked"`, show the `SaveConfirmDialog`
4. On "Save & Leave" → save spec + reference, then call `blocker.proceed()`
5. On "Discard" → call `blocker.proceed()`
6. On "Cancel" → call `blocker.reset()`
7. Remove `pendingNavigationRef` — no longer needed since `useBlocker` handles the destination

### File: `src/hooks/useOrderBuilder.ts`
1. In `useConfirmOrderItem`'s `onSuccess`, add `qc.invalidateQueries({ queryKey: ["all_orders"] })` so the orders list refreshes

## Summary
- `useBlocker` catches ALL navigation (sidebar, back button, URL changes) — not just one button
- Query invalidation fix ensures the orders list shows updated status and price after "Add to Cart"

