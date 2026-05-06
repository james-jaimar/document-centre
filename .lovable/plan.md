
## Branch-Scoped Credit Facilities

Currently, credit settings (account customer flag, credit limit, payment terms, discount %) are stored in `tenant_memberships.metadata` — meaning one set of settings per customer per tenant. This plan moves them to a dedicated `customer_credit_accounts` table keyed by branch, so each branch can independently manage credit facilities for their customers.

### Why this matters

A PostNet franchisee in Sandton may already have existing account customers they bill monthly. When they onboard to the SaaS, they need to mirror those credit terms per-branch — separate limits, terms, and discounts from Rosebank or any other branch. Head office can still see everything.

---

### 1. New `customer_credit_accounts` table

```sql
CREATE TABLE public.customer_credit_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  app_id        uuid NOT NULL,
  branch_id     uuid,              -- NULL = tenant-wide default
  customer_profile_id uuid NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  credit_limit  numeric(12,2),
  payment_terms_days integer,
  default_discount_pct numeric(5,2),
  account_ref   text,              -- external account number from legacy system
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, customer_profile_id)
);
```

- `branch_id = NULL` means a tenant-wide default (head office sets baseline terms).
- Branch-specific rows override the tenant-wide row when present.
- `account_ref` lets them store their existing billing system reference (e.g. Pastel account number).

RLS: staff can manage for their tenant; branch staff see only their branch rows; customers can read their own.

### 2. Migrate existing metadata

A one-time data migration will copy any existing `is_account_customer` / `credit_limit` / `payment_terms_days` / `default_discount_pct` from `tenant_memberships.metadata` into the new table (as tenant-wide rows with `branch_id = NULL`), then clean the metadata.

### 3. Updated hook: `useCustomerCreditAccount`

Replace `useCustomerAccount.ts` with a new hook that:
- Queries `customer_credit_accounts` filtered by `(tenant_id, customer_profile_id)`.
- Returns all rows (tenant-wide + per-branch).
- Provides `upsert` and `delete` mutations.
- Exposes a `resolvedAccount(branchId)` helper: returns branch-specific row if exists, else tenant-wide row.

### 4. Updated UI: `CustomerAccountSettings`

- Show a branch selector (or "All branches — default").
- Display a list of credit account rows (one card per branch + the default).
- Allow adding branch-specific overrides.
- The `account_ref` field lets branch owners record legacy billing references.
- VAT number stays on the membership metadata (it's per-customer, not per-branch).

### 5. Branch portal: credit management

The existing branch admin pages (`/branch/*`) will get a read/write view of credit accounts scoped to their branch, so branch managers can set limits for their own customers.

### 6. Order creation: credit check

When a customer places an order at a branch, the system resolves the credit account (branch-specific or tenant default) and can enforce the credit limit at checkout.

---

### Technical details

**Migration SQL** creates the table, RLS policies, updated_at trigger, and data migration from metadata.

**Files changed:**
- `supabase/migrations/...` — new table, RLS, trigger, data migration
- `src/hooks/useCustomerAccount.ts` → rewrite to `useCustomerCreditAccount.ts`
- `src/components/admin/CustomerAccountSettings.tsx` — branch-aware UI
- `src/pages/admin/AdminCustomerDetail.tsx` — pass branch context
- `src/integrations/supabase/types.ts` — add new table type
- `src/pages/branch/` — add credit account view for branch managers
