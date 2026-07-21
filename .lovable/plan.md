## Diagnosis (verified)

The list **is correctly scoped to the PostNet tenant only** — no cross-tenant leakage. The RPC `get_tenant_customers_for_branch` joins `tenant_memberships` filtered by `tenant_id = <postnet>` and `app_id = <postnet.app_id>`.

The noise is real data, not a bug in scoping:

- PostNet has **311 active `customer` memberships**
- **307 have no name, 306 have no email**
- All the "(no name)" rows are `auth.users.is_anonymous = true` — anonymous storefront sessions that were auto-enrolled as customers by the anonymous-session bootstrap (per the `mem://auth/anonymous-session-bootstrap` rule). They never converted to a real account.

So the picker is honest — those rows exist — but they're useless for quoting.

## Fix

Exclude anonymous / unconverted profiles from the branch quote picker's customer list.

1. Migration: replace `public.get_tenant_customers_for_branch(uuid)` so it also `JOIN auth.users u ON u.id = p.id` and filters `WHERE u.is_anonymous = false AND p.email IS NOT NULL`. Signature and return columns unchanged, so `useTenantCustomersForBranch` and `QuoteCustomerPicker` need no code changes.

That's it — one migration, no frontend edits, no data deletion. The 307 anonymous rows remain in `tenant_memberships` (they're still tied to real anonymous carts/orders and to the storefront bootstrap contract); they just stop appearing in the quote picker.

## Not in scope

- Not touching `useTenantCustomers` (admin tenant customers page). You said the Customers page already looks right (1 real customer), so we'll leave its query alone unless you want the same filter applied there too — let me know.
- Not purging the anonymous memberships. That's a separate housekeeping task with more blast radius (orders, sessions, RLS).
