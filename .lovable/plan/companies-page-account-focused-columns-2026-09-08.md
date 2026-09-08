# Companies page: account-focused columns

Rework the Companies list so it shows account health at a glance instead of contact details.

## Columns (new layout)

| Column | Notes |
| --- | --- |
| Company | name, Trade badge, t/a trading name (unchanged) |
| Account no. | kept |
| Payment terms | "30 days" or "Pay on order (C.O.D.)" |
| Credit limit | from the company record |
| Current balance | outstanding amount owed right now |
| Available credit | limit minus balance; red when negative (over limit) |
| Overdue | amount past its due date; red when above zero |
| Last order | date of their most recent submitted order |
| Total spend | lifetime value of submitted orders |
| Status | Active / Inactive (unchanged) |

Removed: Email, Phone, VAT no., City.

## Filters and sorting

- Keep the search box (still searches name, trading name, VAT, account no.).
- Add two quick toggles: **Over limit** and **Overdue**.
- Make Credit limit, Balance, Available, Overdue, Last order and Total spend sortable by clicking the header.
- Add a small summary strip above the table: total outstanding, total overdue, and how many companies are over their limit.

Money is shown in the tenant's currency using the existing price formatting.

## Technical notes

- New Postgres function `public.company_account_summary(p_tenant_id uuid, p_app_id uuid, p_branch_id uuid default null)`, `SECURITY DEFINER`, `search_path = public`, returning one row per company: `company_id, balance, overdue, last_order_at, total_spend`.
  - Balance/overdue aggregate `customer_account_ledger` by `company_id` using the same rules as `resolve_account_balance` (balance = sum of amounts; overdue = charges with `due_date < current_date`).
  - `last_order_at` / `total_spend` aggregate `orders` joined through `tenant_memberships.company_id = company.id AND orders.user_id = tm.profile_id`, counting only submitted orders (excluding `cart`, `draft`, `cancelled`).
  - Function body scopes to the caller's tenant access; execute granted to `authenticated` only (no `anon`).
- New hook `useCompanyAccountSummaries({ branchId })` wrapping that RPC, keyed by tenant/app/branch, so the list needs one extra request rather than one per row.
- `CompaniesList.tsx` merges the summary map into the company rows, renders the new columns, sorting state and the two filter toggles. `CompanyFormDialog`, `CompanyDetailView` and the branch/admin pages are untouched apart from passing existing props.
