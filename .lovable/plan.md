# Fix outbound email "From name"

## Problem
Email arrives as `PostNet <james@jaimar.dev>`, but the branch trading name is `PostNet Test Branch` and the email account's From name is `PostNet Test Store`. Neither is being used — the sender falls back to the tenant's trading name.

## Root cause
In `supabase/functions/send-order-email/index.ts`:

- `senderName = notif.sender_name || tenant.trading_name || tenant.name`
- The branch row is fetched without `trading_name`, and the chosen email account's `from_name` is never consulted.
- The dispatcher (`email-dispatcher`) does `row.from_name ?? creds.from_name`, so whatever we enqueue wins — and we enqueue the tenant name.

## Fix
1. In `send-order-email`, extend the branch query to also select `trading_name` and `legal_name`.
2. Change the sender resolution order to:
   1. `notif.sender_name` (explicit override, if set)
   2. branch `trading_name` / `legal_name` / `name`
   3. tenant `trading_name` / `name`
   4. `"Orders"`
3. Leave `from_email` resolution as-is (still optional; dispatcher will use the selected email account's address).
4. Optional but cleaner: when `notif.sender_name` is not set, pass `from_name: null` so the dispatcher uses the email account's own `from_name` (which the branch admin set to `PostNet Test Store`). This way the From name is driven by the email account, not by the tenant. Recommended approach — confirms the user's mental model that "the email settings allocate the name".

## Recommendation
Go with option 4 (pass `from_name: null` unless `notif.sender_name` is explicitly set). This makes the per-mailbox `From name` field the single source of truth, exactly matching what the user configured in the Email Accounts dialog.

## Scope
- File: `supabase/functions/send-order-email/index.ts` only.
- Deploy `send-order-email` after edit.
- No DB or schema changes. No UI changes. Historical emails unchanged.
