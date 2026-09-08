# Private notes in the order message area

Add a message type choice above the message box on the staff order page, with just two options:

1. **Message customer** (default) — goes to the customer exactly as today, and triggers the usual customer email.
2. **Private note** — stays inside your team. The customer never sees it, and no email goes out.

## What staff see

- A small dropdown labelled "Message type" at the top of the composer, defaulting to "Message customer".
- When "Private note" is selected, the composer changes appearance (amber/grey tint, "Private note — internal only" hint) so nobody sends internal wording to a customer by accident. The Send button reads "Save note".
- In the timeline feed, private notes are shown with a lock icon, an "Internal" badge and a distinct muted style, sitting in the same chronological feed as everything else.
- Attachments work the same way on both types; files attached to a private note stay internal.

## Where it applies

- Tenant admin order detail and branch order detail (both use the same timeline panel).
- The customer order page is unchanged — it already only shows customer-facing messages.

## Technical section

The database and server already support this end to end; the work is confined to the composer UI.

- `messages.is_internal` exists; the `messages_select_policy` and `message_attachments_select_policy` RLS policies already restrict internal rows to staff (`user_is_staff_for_branch`), so no migration is needed.
- `order-engine` `sendMessage` already accepts `is_internal`, sets timeline `visibility: "admin"` for internal messages, and skips the customer notification email when `is_internal` is true.
- Change in `src/components/orders/detail/TimelinePanel.tsx`:
  - New local state `messageType: "customer" | "private"` rendered with the existing `Select` component.
  - Pass `is_internal: messageType === "private"` to `sendMessage` instead of the current hardcoded `false`; reset to "customer" after send.
  - Feed rendering branches on `item.is_internal` for badge/style.
  - Placeholder text and toast copy adapt to the selected type.
- `useMessageDesktopAlerts` already ignores internal messages, so staff pop-ups stay correct.

No changes to the customer portal, the schema, or the edge functions.
