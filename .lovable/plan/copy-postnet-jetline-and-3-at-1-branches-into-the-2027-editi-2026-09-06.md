# Copy PostNet, Jetline and 3 at 1 branches into The 2027 Edition as trade businesses

## What you'll get

Every store from the three source tenants appears in The 2027 Edition under Companies, flagged as a trade account, ready to order at trade prices.

Counts confirmed in the database right now:

| Source tenant | Stores | With email | With phone |
| --- | --- | --- | --- |
| PostNet South Africa | 516 | 516 | 514 |
| Jetline | 45 | 45 | 44 |
| 3 at 1 | 76 | 76 | 75 |
| **Total** | **637** | 637 | 633 |

The 2027 Edition currently has 0 companies, so nothing can be overwritten.

## How each store is mapped

Each store becomes one company record:

- Company name: the store name (e.g. "PostNet Mayville")
- Email, phone, website: copied from the store
- Billing address: the store's street address, city, province, postal code, country
- Trade account: on
- Account number: a readable reference built from the source group and store, e.g. `POSTNET-MAYVILLE`, `JETLINE-…`, `3AT1-…`
- Notes: records which tenant it came from, so you can filter later
- Active: matches the store's active flag
- Not tied to any branch in 2027 Edition (tenant-wide), since 2027 Edition has no branches

## People

Store contacts that already have a login in the system are linked to their new company as trade customers. Verified counts of store-linked people who have an email address on file:

- 3 at 1: 77
- PostNet: 7
- Jetline: 1

These 85 people get a customer membership in The 2027 Edition, linked to the matching company, marked trade, and set as primary contact where the store has exactly one.

The remaining people in those tenants (379 end-customer records) are not store contacts and mostly have no email on file, so they are excluded. Say the word if you want them too.

Important: no new logins are created. People who don't already have an account in the system can't be given one from a data copy — they'd sign up (or be invited) against the store email, and then get linked. The company email is still stored on every company record either way.

## Technical notes

- Insert into `public.customer_companies` selecting from `public.branches` where `tenant_id` in the three source tenants; `tenant_id` = `238a6748-…` (The 2027 Edition), `app_id` = `a0000000-…-0001`, `branch_id` = null, `is_trade_customer` = true, `billing_country` = `ZA`.
- Then insert `public.tenant_memberships` rows for source `branch_manager` memberships whose profile has an email: `role = 'customer'`, `is_trade_customer = true`, `company_id` matched by source branch, `branch_id` = null, `is_primary_branch = false` (a partial unique index allows only one primary branch per profile), `is_active` = source value.
- Both inserts are idempotent-guarded: skip where a company with the same `mis_account_number` already exists in the target tenant, and rely on the existing `(profile_id, app_id, tenant_id, branch_id, role)` unique index for memberships.
- Data-only change via the SQL run tool; no schema migration, no code changes.
