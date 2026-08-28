# Tenant admin: full customer creation + tenant pack pricing

## 1. Full "Add customer" modal in the tenant admin

Today the tenant admin dialog (`src/components/admin/AddCustomerDialog.tsx`) only has an email box and calls `invite-member`, so there is no way to set up a customer manually.

Replace it with a proper create-customer form, modelled on the branch dialog but richer:

- Fields: email (required), first name, last name, phone, optional branch selector (tenant-wide when left blank).
- Trade section: "Trade customer" toggle and MIS account number (matches the fields already on the customer record).
- Invite control: single checkbox "Send 'set your password' email" — when off, the account is created silently and staff can hand over credentials later.
- Optional: "Log in as this customer after creating" (same behaviour the branch dialog already offers).
- Submits to the existing `create-customer` edge function (which already supports tenant admins and a null branch), then writes the trade flag / account number onto the new `tenant_memberships` row.
- On success, refresh the customers list and show whether the customer was created or an existing account was linked.

## 2. Pack pricing at tenant level

Pack ladders currently exist at master (`/platform/master-pricing`) and branch (`/branch/catalogue-pricing`) only. The tenant admin catalogue pricing page has no pack section, so tenants like Impress can't price their own deskpads.

- Add a `TenantPackPricingEditor` (a tenant-scoped twin of `BranchPackPricingEditor`) that edits the `product_pack_pricing_overrides` row with `branch_id = null`, using master blocks as the inherited parent.
- Same accordion-per-family UI, `Inheriting` / `Tenant override` badges, save and "revert to master" actions, trade price column included.
- Mount it on `src/pages/admin/AdminCatalogPricing.tsx` below the rate card section.
- Precedence stays as already implemented: branch override > tenant override > master.

## Technical notes

- No database changes needed — `product_pack_pricing_overrides` already supports `branch_id IS NULL` rows and the hooks in `useProductPackPricingOverrides.ts` handle that scope.
- Branch pack editor already reads the tenant-level row as its parent, so branch ladders will inherit tenant prices as soon as they exist.
- Trade fields (`is_trade_customer`, `mis_account_number`) already exist on `tenant_memberships`; the new modal just sets them at creation time.
