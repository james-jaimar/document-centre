# New-orders badge in Branch sidebar + Onboarding link bug

Two small, independent fixes.

## 1. Show "new orders" count in the Branch sidebar

Currently the red badge next to **Orders** in `BranchSidebar` is wired to `totalUnread` **messages** (from `useUnreadMessagesStaff`), not new orders. When a customer places an order, nothing in the sidebar changes until they also send a message.

### What to build

- Add a new hook `useNewOrdersCount(tenantId, branchId)` in `src/hooks/useOrders.ts` (or a small dedicated file) that queries `orders` with `admin_status = 'new_order'` scoped to the current branch (or all linked branches when the operator is multi-branch, matching the `BranchOrders` scope), returning the count only.
  - Uses the same `fetchAdminOrders`-style filter to stay consistent with existing RLS/tenant scoping.
  - Real-time: subscribe to Postgres changes on `orders` filtered by `branch_id` and invalidate the query on INSERT / status update so the badge updates the moment an order lands (no refresh needed).
- In `BranchLayout.tsx`:
  - Call the new hook and pass `newOrderCount` into `BranchSidebar` alongside the existing `unreadOrderCount` (messages).
- In `BranchSidebar.tsx`:
  - Accept a new prop `newOrderCount`.
  - Render the "new orders" badge on the **Orders** nav item (this is what the user asked for). Keep the existing messages badge behaviour on the header bell (`StaffMessagesBell`) — messages already have their own indicator there, so removing the messages count from the sidebar avoids double-counting.
  - Badge style: keep the current red pill, cap at `99+`, show a small red dot in collapsed mode.
- Optional nicety: also add a browser-title prefix like `(3) Branch Portal` when there are new orders (reuse the existing `useDocumentTitleUnread` pattern with a new small hook, or extend it). Flag this as optional in build — only add if it's a one-liner.

### Technical notes

- Use `admin_status = 'new_order'` — that's the canonical "just landed, not yet reviewed" state per `ALL_ADMIN_STATUSES` in `BranchOrders.tsx`.
- The count should respect the current branch (`branchId` from `useTenantContext`) so a manager only sees their branch. Multi-branch operators viewing "all" scope is not something the sidebar currently exposes, so keep the badge branch-scoped.
- Reuse existing query invalidation helpers (`invalidateUserOrderCaches` isn't the right one here — this is admin-side; just invalidate `["new-orders-count", branchId]` from the realtime channel handler).

## 2. Onboarding checklist: link stops working until refresh after ticking

**Repro (from user):** Tick a step in `BranchOnboardingChecklist` → try to click a different step's link → nothing happens until the page is refreshed.

### Likely cause (to confirm during build)

In `BranchOnboardingChecklist.tsx` each row is a `<div>` containing both a shadcn `<Checkbox>` and a React Router `<Link>` as siblings. When the mutation resolves, `useBranchOnboarding` is invalidated with `staleTime: 0` and `refetchOnMount: "always"`. During the refetch React Query briefly triggers a re-render; combined with the guard `if (isLoading || !data) return null;` the whole card can unmount and remount, which can swallow the very next click if the pointer lands on the freshly-mounted Link before hydration of its event handler.

A related suspect: the checkbox is disabled via `toggle.isPending`, but if the mutation stays "pending" until the invalidated query resettles, the row's Radix Checkbox may keep focus/pointer capture, blocking the sibling Link's click.

### Fix

- Remove the "return null while loading" flicker: keep the previous `data` while refetching (React Query does this by default — the culprit is the `if (isLoading || !data) return null;` guard treating a refetch as "loading"). Change the guard to only bail when `data` is genuinely absent (`if (!data) return null;`), so the card no longer unmounts on every tick.
- Don't gate the whole row on `toggle.isPending`. Instead, track pending per-step (e.g., a local `pendingStep` state or check `toggle.variables?.step === s.key`) so only the clicked checkbox is disabled; other rows and their Links stay fully interactive.
- Confirm in build via Playwright: tick step A, then immediately click step B's link — should navigate without a refresh.

## Out of scope

- No changes to the pricing engine, order engine, or messages bell behaviour.
- No schema changes.
