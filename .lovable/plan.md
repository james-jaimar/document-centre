## Goal
Make unread customer messages impossible to miss for branch/admin staff, with multiple proactive surfaces that all link back to the order's message thread.

## Where unread indicators will appear

**1. Persistent header Messages bell (admin + branch portals)**
A bell icon next to the user avatar in the top bar of every admin/branch page (mirroring the existing customer-side `MessagesBell`). Shows total unread count with a red badge. Click opens a popover listing orders with unread messages, newest first, each linking straight to the order. "View all" jumps to a filtered Orders list.

**2. Dashboard — new "Unread messages" KPI tile + panel**
- Add a 7th KPI tile ("UNREAD MSGS") alongside Pending / In Production / Ready / etc., showing count of orders with unread customer messages.
- Add an "Awaiting your reply" panel beside (or under) the Active queue, listing the top 5 orders with unread messages, time since last customer message, and a quick link to open the order.

**3. Orders list page**
- Add a sticky filter chip at the top: "Unread messages (N)" — clicking filters the table to only orders with unread messages.
- On each order row, show a red message badge (e.g. "3 new") in a dedicated column so it's visible without scrolling within a row.
- Default sort option: "Unread first" toggle, so orders with new messages float to the top regardless of where they sit chronologically.

**4. Sidebar nav**
Add a small red dot + count next to the "Orders" menu item when there are any unread messages, so even from other sections (Quotes, Customers, Pricing) staff see there's something waiting.

**5. Browser tab title**
When unread > 0, prefix the document title with `(N) ` so it's visible even when the tab is in the background.

## Technical approach

- Reuse the existing `useUnreadMessagesStaff(tenantId, branchId)` hook (already wired to realtime `messages` INSERTs) as the single source of truth — no new RPCs needed.
- New components:
  - `src/components/admin/StaffMessagesBell.tsx` — header popover (adapted from `MessagesBell.tsx`).
  - `src/components/admin/UnreadMessagesPanel.tsx` — dashboard panel.
  - `src/components/admin/UnreadBadge.tsx` — small shared red badge.
- Mount the bell in the admin and branch layout headers.
- Dashboard tile + panel added to `BranchDashboard.tsx` (and admin dashboard equivalent).
- Orders page (`BranchOrders.tsx` / admin orders): add column + filter chip + "Unread first" sort using the same hook map.
- Sidebar dot: read the same hook in the layout and render a dot on the Orders nav item.
- Tab title: a tiny `useDocumentTitleUnread(count)` hook in the layout.
- Marking read continues to use the existing `useMarkOrderReadStaff(orderId)` when an order is opened — no schema changes.

## Out of scope (can do next round if you want)
- Email/push notifications to staff for unread messages.
- Per-user (not per-tenant) read state — currently read state is per-order/per-side, which matches Print Job's model.

## Files touched (approx.)
- New: 3 components + 1 small hook.
- Edited: branch + admin layout (header + sidebar), `BranchDashboard.tsx`, admin dashboard, `BranchOrders.tsx`, admin Orders page.
- No DB migrations.
