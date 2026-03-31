

# Plan: Build Tenant Settings System

## What ChatGPT adds that we should incorporate

After comparing both recommendation sets, the key additions worth adopting:

1. **Setting inheritance model** — platform defaults cascade to app, tenant, branch, product. A `resolve_setting()` function merges layers, so tenants only store overrides.
2. **Workflow templates** — named presets (`prepaid_no_proof`, `prepaid_with_proof`, `account_with_proof`, `account_no_proof`) instead of raw toggles. Simpler for tenant admins.
3. **Tenant onboarding status** — track setup progress (`draft`, `setup_in_progress`, `ready`, `suspended`) on the tenants table.
4. **Permission flags** — extend `tenant_memberships` with granular flags beyond role (e.g. `can_edit_prices`, `can_assign_jobs`, `can_mark_paid`).
5. **Legal vs display name** — separate `legal_name`, `trading_name`, `vat_number`, `registration_number` on tenants.
6. **Tenant-product enablement** — a mapping table so each tenant controls which products they sell, with overrides.

Items 1, 2, 3, 5 are high value for v1. Items 4 and 6 can come in v2.

## What we will build now

### Phase 1: Database changes

**Extend `tenants` table** with new columns:
- `legal_name`, `trading_name`, `vat_number`, `registration_number`
- `billing_email`, `support_email`, `support_phone`, `website_url`
- `default_currency` (default `'ZAR'`), `country` (default `'ZA'`), `timezone` (default `'Africa/Johannesburg'`), `locale` (default `'en-ZA'`)
- `onboarding_status` (default `'draft'`) — values: `draft`, `setup_in_progress`, `ready`, `suspended`
- `payment_mode` (default `'prepaid'`) — values: `prepaid`, `account`, `mixed`
- `proof_mode` (default `'optional'`) — values: `always`, `optional`, `never`
- `workflow_template` (default `'prepaid_no_proof'`) — values: `prepaid_no_proof`, `prepaid_with_proof`, `account_no_proof`, `account_with_proof`

**Create `tenant_settings` table** for flexible key-value config:
```text
tenant_settings
├── id              uuid PK
├── tenant_id       uuid FK → tenants (NOT NULL)
├── category        text NOT NULL
├── setting_key     text NOT NULL
├── setting_value   jsonb NOT NULL DEFAULT '{}'
├── value_type      text NOT NULL DEFAULT 'string'
├── is_sensitive    boolean DEFAULT false
├── sort_order      integer DEFAULT 0
├── created_at      timestamptz
├── updated_at      timestamptz
└── UNIQUE(tenant_id, category, setting_key)
```

RLS: select/update for tenant owner/admin via `user_is_tenant_admin()`, full access for `platform_admin`.

**Seed default settings** for the existing tenant across these categories:
- `branding` — primary_color, secondary_color, accent_color
- `workflow` — requires_payment_before_production, requires_proof_approval, allows_partial_dispatch, auto_accept_orders, allows_reorder, requires_admin_review
- `uploads` — allowed_file_types, max_file_size_mb, require_customer_upload
- `notifications` — order_confirmation, payment_received, proof_ready, order_dispatched, order_completed
- `financial` — tax_label, tax_rate, tax_inclusive, invoice_prefix, invoice_next_number
- `delivery` — methods_enabled, free_shipping_threshold
- `documents` — proforma_prefix, delivery_note_prefix, legal_footer_text

### Phase 2: Admin Settings UI

Build `/admin/settings` as a tabbed settings page with these tabs:

**General** — tenant profile fields (name, legal name, trading name, VAT, registration, contact details, currency, timezone, country, locale)

**Branding** — logo upload, brand colors, portal name

**Workflow** — workflow template selector (4 presets), plus individual toggle overrides

**Financial** — tax config, invoice numbering, payment mode, bank details

**Uploads & Proofs** — file types, size limits, proof mode

**Notifications** — toggle which events send emails, sender name/email

**Documents** — numbering prefixes, legal footer, customer visibility rules

**Delivery** — enabled methods, fee rules, free shipping threshold

Each tab reads/writes from a combination of `tenants` columns (for indexed/critical fields) and `tenant_settings` rows (for flexible config).

### Phase 3: Setting inheritance helper

Create a `resolve_tenant_setting(p_tenant_id, p_category, p_key)` SQL function that checks:
1. Tenant-specific setting
2. Falls back to a platform default (tenant_id IS NULL row)

This keeps the system extensible for app-level and branch-level overrides later without changing the API.

## Technical details

### New files
- `src/hooks/useTenantSettings.ts` — CRUD hooks for `tenant_settings` table
- `src/pages/admin/AdminSettings.tsx` — rewrite with tabbed settings UI
- `src/pages/admin/settings/GeneralTab.tsx`
- `src/pages/admin/settings/BrandingTab.tsx`
- `src/pages/admin/settings/WorkflowTab.tsx`
- `src/pages/admin/settings/FinancialTab.tsx`
- `src/pages/admin/settings/UploadsTab.tsx`
- `src/pages/admin/settings/NotificationsTab.tsx`
- `src/pages/admin/settings/DocumentsTab.tsx`
- `src/pages/admin/settings/DeliveryTab.tsx`

### Modified files
- `src/integrations/supabase/types.ts` — auto-updated after migration

### Migration
- One migration: extend `tenants`, create `tenant_settings`, add RLS, seed defaults, create `resolve_tenant_setting()` function

### Implementation order
1. Database migration (extend tenants + create tenant_settings + seed + helper function)
2. `useTenantSettings` hook
3. Build tabbed AdminSettings page with all 8 tabs
4. Wire each tab to read/write tenant columns and tenant_settings rows

