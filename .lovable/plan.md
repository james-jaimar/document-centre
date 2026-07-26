## Goal
Let each branch control its own invoice numbering (prefix, starting number, and optional suffix/format), independent of the tenant. Falls back to tenant setting, then app default, if branch hasn't set anything.

## Current state (verified)
- `generate_invoice_number(p_tenant_id, p_app_id)` reads `invoice_prefix` from `tenant_settings` (financial) and pulls the next number from `number_sequences`, which is keyed **only by `app_id`** — so every tenant/branch shares one running counter.
- Format is hard-coded: `PREFIX-YYYY-00001`.
- Admin UI for prefix/next-number lives at tenant level only (`src/pages/admin/settings/FinancialTab.tsx`); no branch equivalent.
- `branch_settings` already supports the same `(category, setting_key, setting_value)` shape as `tenant_settings`, so no schema work there.
- `generate-invoice-pdf` edge function calls `issue_invoice_number(tenant_id, app_id)` — needs to pass `branch_id`.

## Changes

### 1. Database (single migration)
- Extend `public.number_sequences`: add nullable `tenant_id uuid` and `branch_id uuid`. Replace the current unique key with a unique index on `(app_id, coalesce(tenant_id,'00000000-...'), coalesce(branch_id,'00000000-...'), sequence_type)` so each branch (and each tenant) gets its own counter while the existing app-wide row keeps working as the global fallback.
- Update `public.next_number(...)` (or add an overload) to accept optional `p_tenant_id`, `p_branch_id`. It will:
  - Look for a row matching the most specific scope (branch → tenant → app).
  - If a branch/tenant row doesn't exist yet, seed it from the branch/tenant `invoice_next_number` setting (or the app fallback) on first use, then increment atomically.
- Update `public.generate_invoice_number` and `public.issue_invoice_number` to accept a new `p_branch_id uuid default null` parameter and:
  - Resolve `invoice_prefix`, `invoice_suffix` (new), `invoice_number_format` (new; e.g. `{prefix}-{yyyy}-{seq:5}` or `{prefix}-{seq:5}`) from `branch_settings` first, then `tenant_settings`, then the app sequence.
  - Call `next_number` with the branch scope so numbering is independent per branch.
- Keep the old two-arg signatures working (default `p_branch_id := null`) so any older caller keeps functioning.

### 2. Edge function
- `supabase/functions/generate-invoice-pdf/index.ts`: pass `p_branch_id: order.branch_id` to the `issue_invoice_number` RPC.

### 3. Branch admin UI
- New `BranchFinancialTab` (mirrors the invoice-numbering + tax parts of `FinancialTab.tsx`, but reads/writes `branch_settings`):
  - Invoice Prefix
  - Invoice Suffix (optional)
  - Number format template (dropdown: `PREFIX-YYYY-00001`, `PREFIX-00001`, `PREFIX-YYYYMM-00001`, custom)
  - Next Invoice Number (with a warning that lowering it below the current sequence is ignored)
  - "Inherit from tenant" toggle — when on, we simply don't write the branch overrides and generation falls back to tenant values.
- Wire it into the branch settings route alongside the other branch tabs.

### 4. Small polish
- On the tenant `FinancialTab`, add copy clarifying that branches can override these values.

## Out of scope
- Backfilling old invoice numbers.
- Changing invoice numbers on existing issued invoices (numbers remain immutable once assigned).
- Quote / order / job number formats (this only touches invoices, per the request).

## Technical notes
- Sequence rows are seeded lazily inside `next_number` under a row lock (`FOR UPDATE`) to keep concurrent invoice issuance safe.
- `branch_settings` RLS already restricts writes to branch managers/owners, so no new policies are needed.
- Types file will regenerate after the migration; UI code that touches new columns will be added after that.
