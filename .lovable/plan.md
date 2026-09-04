# Desktop alerts for new customer messages (staff)

## What exists today
Staff in the tenant admin area and the branch area already get:
- a bell icon with a live unread count that updates the moment a customer sends a message
- a "(3)" style counter on the browser tab title

There is nothing that grabs attention when the tab is in the background: no pop-up, no sound.

## What gets added
A desktop pop-up (the small notification your operating system shows in the corner) plus an optional chime whenever a customer message arrives while the admin or branch area is open in a tab.

- The pop-up shows the order number and the first line of the message.
- Clicking it focuses the tab and opens that order.
- It only fires when the message is new and unread, and it is skipped if staff are already looking at that order.
- Each staff member can turn pop-ups and the sound on or off for themselves; the setting is remembered on that device.
- Everyone with order access to the branch or tenant gets alerted (no role filter).

## Permission handling
The browser asks permission the first time, and only after a click. A small "Turn on desktop alerts" prompt appears once in the bell panel; once allowed, it disappears. If the app is being viewed inside the Lovable preview frame, the prompt explains it must be opened in its own tab, since browsers block the permission request inside a frame. If permission was previously denied, the toggle explains how to re-enable it in browser settings.

## Not included
True push that works when the app is closed (that needs a Firebase connection and per-device registration), and email alerts. Both can be added later.

## Technical notes
- New hook `src/hooks/useMessageDesktopAlerts.ts`: subscribes to the same realtime `messages` INSERT channel already used by `useUnreadMessagesStaff`, filters to `sender_type = 'customer'`, non-internal, matching the current `tenantId`/`branchId`, then fires `new Notification(...)` and plays a short WebAudio chime. Dedupes by message id in a ref so a message is never announced twice.
- Mounted once each in `src/components/AppLayout.tsx` and `src/components/BranchLayout.tsx`, alongside the existing unread hooks.
- Preferences (`desktopAlerts`, `soundAlerts`) stored per user in `localStorage` keyed by user id — no schema change needed.
- New `src/components/staff/DesktopAlertSettings.tsx`: two switches plus the permission-request button, rendered in the footer of `StaffMessagesBell`'s popover.
- The realtime payload only carries the row; order number is resolved from the existing bell query or fetched lazily, falling back to a generic "New customer message" title.
- Chime generated in-code via WebAudio (no asset file), guarded so it never throws when autoplay is blocked.
