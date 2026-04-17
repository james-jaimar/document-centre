

# Plan: CRM — customer area (admin) + account area (customer)

Two parallel surfaces, sharing the same data. No new tables needed for the first cut — everything keys off `profiles` + `tenant_memberships` (role=`customer`) + their `orders`.

---

## A. Admin: Customers CRM (`/admin/customers`)

New top-level nav item under **Configuration**, between Users and Pricing. Tenant-scoped via `useTenantContext`.

### A1. Customer list page

```text
┌─ Customers ─────────────────────── [+ Add customer] ─┐
│ [Search name/email/company]  [All ▾]  [Active ▾]      │
├──────────────────────────────────────────────────────┤
│ Name              Company       Email         Orders  Spent     Last     │
│ Wendy Jaimar      Acme Ltd      w@acme.co     12      R 14,300  3d ago   │
│ James Hawkins     —             admin@px.za    1      R 701.50  today    │
│ ...                                                                       │
└──────────────────────────────────────────────────────┘
```

Source: aggregate from `tenant_memberships` (role=`customer`, tenant_id=current) joined to `profiles` and a left-join sum of their `orders`. Includes "guest customers" — orders where `ordered_by_profile_id` exists but no membership row yet (we'll auto-backfill).

### A2. Customer detail page (`/admin/customers/:id`)

Tabbed:
1. **Overview** — contact card, lifetime value, order count, last order, account status, internal tags/notes.
2. **Orders** — full list (re-uses `useAdminOrders` filtered by `ordered_by_profile_id`).
3. **Addresses** — read-only list pulled from past `order_addresses` (deduped). Edit comes in Phase 4 of the ecommerce roadmap.
4. **Activity** — timeline of order placements, payments, status transitions (joined from `status_history`).
5. **Notes** — internal-only notes (new tiny `customer_notes` table).

### A3. Backfill membership for existing order placers

Migration: for every `orders.ordered_by_profile_id` that doesn't have a `tenant_memberships` row for that tenant, insert one with `role='customer'`, `is_active=true`. This makes the existing INV-00011 customer show up immediately.

### A4. Auto-create membership at order placement

In `order-engine` `placeOrder` op: if no membership exists for `(profile_id, tenant_id, app_id)`, insert one as `customer`. Idempotent.

---

## B. Customer: My Account (`/t/:slug/account`)

Replace the empty `CustomerSettings.tsx` stub with a real account hub.

```text
┌─ My Account ─────────────────────────────────────────┐
│ [Profile] [Addresses] [Order History] [Security]      │
├──────────────────────────────────────────────────────┤
│ Profile tab:                                          │
│   First name, Last name, Display name                │
│   Email (read-only), Phone, Company                  │
│   [Save]                                              │
└──────────────────────────────────────────────────────┘
```

Tabs:
1. **Profile** — edit `profiles` row (first/last name, display, phone).
2. **Addresses** — list saved delivery/billing addresses (uses an `order_addresses`-style read for now; full `customer_addresses` table is queued for Phase 4 of the ecommerce roadmap — small and additive).
3. **Order History** — link/embed of `CustomerOrders` (already exists).
4. **Security** — change password (uses `supabase.auth.updateUser({ password })`), sign out other sessions.

Sidebar item rename: "Account Settings" → "My Account".

---

## C. New table: `customer_notes` (admin-only)

Small. For staff to record info about a customer (calls, preferences, credit terms).

```sql
customer_notes (
  id uuid pk,
  app_id uuid not null,
  tenant_id uuid not null,
  customer_profile_id uuid not null,
  body text not null,
  created_by uuid,
  created_at timestamptz default now()
)
```

RLS: select/insert/update/delete restricted to staff via `user_is_staff_for(app_id, tenant_id)`.

---

## D. Files I'll touch

**Database (migration):**
- Create `customer_notes` table + RLS.
- Backfill `tenant_memberships` for existing order placers.

**Edge function:**
- `supabase/functions/order-engine/index.ts` — auto-insert customer membership on `placeOrder`.

**Admin (new):**
- `src/pages/admin/AdminCustomers.tsx` (list)
- `src/pages/admin/AdminCustomerDetail.tsx` (tabs)
- `src/hooks/useTenantCustomers.ts` (list + detail + notes hooks)

**Admin (edit):**
- `src/components/AppSidebar.tsx` — add "Customers" nav item.
- `src/App.tsx` — register `/admin/customers` and `/admin/customers/:id` routes.

**Customer (new):**
- `src/pages/dashboard/CustomerAccount.tsx` (tabbed account hub)

**Customer (edit):**
- `src/components/CustomerSidebar.tsx` — rename label to "My Account".
- `src/App.tsx` — replace `CustomerSettings` route with `CustomerAccount`.

No changes needed to existing `useTenantMembers` (that one is for staff). The CRM is a separate surface keyed on `role='customer'`.

---

## E. Verification

1. After migration: `/admin/customers` (Printworks tenant) lists at least the user who placed INV-00011 with 1 order, R701.50.
2. Click into them → Orders tab shows INV-00011; Activity shows status transitions.
3. New order on PostNet by a brand-new account → that customer immediately appears under PostNet's Customers list with the order attached.
4. Customer signs in → `/t/printworks/account` → can edit profile fields, change password, view past orders.

Ecommerce roadmap stays intact — this slots in as **"Phase 5 (Customers page)"** delivered early, plus the customer self-service shell that **Phase 4 (Address book)** will fill in next.

