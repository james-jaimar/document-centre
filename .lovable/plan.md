## Problem

The guest storefront at `/t/:slug` shows no branding, no logo, and a generic "Print Centre" header because the underlying database tables have no `anon` RLS policies. When an unauthenticated user visits, every Supabase query returns empty results.

The chain breaks at the first step: `useTenantFromSlug` queries the `tenants` table, gets nothing back, so `useTenantBranding` never fires (no tenant ID), and the product tiles also fail to load.

## Fix — Add Anon Read Policies

A single migration adding **read-only** anon SELECT policies to the tables the guest storefront needs:

### 1. `tenants` — anon can read active tenants by slug

```sql
CREATE POLICY "tenants_public_read_by_slug"
ON public.tenants FOR SELECT TO anon
USING (is_active = true);
```

This lets `useTenantFromSlug` resolve the tenant. The existing `public_branding_read` policy on `tenant_settings` already covers anon, so branding will load once the tenant ID is available.

### 2. `product_families` — anon can read active products scoped to a tenant

```sql
CREATE POLICY "product_families_public_read"
ON public.product_families FOR SELECT TO anon
USING (is_active = true);
```

This lets the product tile grid render for guests.

### 3. `branches` — anon can read active branches (needed for product filtering by branch)

```sql
CREATE POLICY "branches_public_read"
ON public.branches FOR SELECT TO anon
USING (is_active = true);
```

### 4. `product_options` — anon can read (needed for the order configurator)

```sql
CREATE POLICY "product_options_public_read"
ON public.product_options FOR SELECT TO anon
USING (true);
```

### 5. `pricing_rules` — anon can read (needed to show prices)

```sql
CREATE POLICY "pricing_rules_public_read"
ON public.pricing_rules FOR SELECT TO anon
USING (true);
```

## Security Notes

- All policies are **SELECT only** for the `anon` role — no inserts, updates, or deletes.
- Tenants and products are scoped to `is_active = true` so deactivated records stay hidden.
- Sensitive settings are already excluded by the existing `is_sensitive = false` filter on `tenant_settings`.

## What This Fixes

- Tenant name and logo appear in the header
- Facsimile header/footer renders (if configured)
- Product family tiles load on the dashboard
- Product options and pricing display in the configurator
- All of this works for unauthenticated guest visitors
