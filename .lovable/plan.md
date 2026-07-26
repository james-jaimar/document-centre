## Problem

Placing an order fails with:
`generate_order_number failed: function public.next_number(uuid, unknown) is not unique`

## Root cause (confirmed via pg_proc)

There are two overloads of `public.next_number` in the database:

1. `next_number(p_app_id uuid, p_sequence_type text)` — legacy 2‑arg
2. `next_number(p_app_id uuid, p_sequence_type text, p_tenant_id uuid, p_branch_id uuid)` — 4‑arg (added with per‑branch invoice numbering)

The 4‑arg version has DEFAULTs for `p_tenant_id` / `p_branch_id`, so a call like `next_number(p_app_id, 'order')` matches BOTH overloads and Postgres refuses with "is not unique". `generate_order_number` and `generate_quote_number` both call the 2‑arg form, so every order/quote placement now fails.

## Fix

Single migration to remove the ambiguity by dropping the legacy 2‑arg overload and routing everything through the 4‑arg version (which already defaults tenant/branch to NULL, preserving old behaviour for order/quote sequences that are app‑scoped only).

Steps:

1. `DROP FUNCTION public.next_number(uuid, text);` (the 2‑arg overload only — leaves the 4‑arg one intact).
2. Recreate `generate_order_number` and `generate_quote_number` to call `next_number(p_app_id, 'order'/'quote', NULL, NULL)` explicitly, so the intent is unambiguous even if someone re‑adds an overload later.
3. Leave `generate_invoice_number` / `issue_invoice_number` alone — they already pass all 4 args.

No app / TypeScript changes required. No RLS or grants change.

## Verification

- Re-run `pg_proc` query to confirm only the 4‑arg `next_number` remains.
- Place an order from the branch admin "as customer" flow and confirm order number is generated (e.g. `INV-00123`).
- Create a spec quote and confirm quote number is generated.
- Generate an invoice on a branch with a custom prefix to confirm branch‑scoped numbering still works.
