
# Tenant Email Sending Mode

## What we're building

Give each tenant two email sending options (matching the PrintJob reference):

1. **Send via Document Centre domain** -- emails go out as `noreply@document-centre.jaimar.dev` (or a configurable platform address) using the platform's own Graph/SMTP account. Zero config for the tenant.
2. **Send via own mailbox** -- tenant configures their own SMTP credentials (already working via `EmailAccountsTab` and `email-account-manage`).

The tenant admin picks their mode in Settings. The dispatcher already has fallback logic to Graph accounts; we just need to formalise the choice and surface it in the UI.

## Technical plan

### 1. Add `email_send_method` tenant setting

Store in the existing `tenant_settings` JSONB cascade as `email_send_method`:
- `"platform"` (default) -- use the platform Graph/SMTP account
- `"own_smtp"` -- use the tenant's configured `email_accounts`

No schema migration needed -- this goes into the existing JSONB settings column via `resolve_tenant_setting`.

### 2. Update EmailAccountsTab UI

Restructure the top of the Email settings page:
- Add a radio/card selector at the top: "Send via Document Centre" vs "Send via your own mailbox"
- When "Platform" is selected, show the platform sender identity (read-only) and hide the SMTP account management
- When "Own SMTP" is selected, show the existing SMTP account management UI
- Persist the choice via `useTenantSettings` hook

### 3. Update email-queue.ts resolver

In `resolveEmailAccount()`:
- Read the tenant's `email_send_method` setting
- If `"platform"` or not set, return `null` (dispatcher falls back to platform Graph account -- already works)
- If `"own_smtp"`, resolve through the existing tenant/branch account chain
- This is a small change to the shared helper

### 4. Platform email identity display

Add a read-only card showing the platform sender when "Document Centre" mode is selected:
- From name and address pulled from the platform's default email account
- Verification status badges (Email, SPF, DKIM, DMARC) -- cosmetic for now, real verification is on the platform account

### 5. System name and notes fields

Following the PrintJob reference, add two fields to tenant settings:
- **System name** -- the display name used in email subjects/headers (defaults to tenant trading name)
- **Note** -- a configurable message appended to order emails (e.g. "PLEASE UPLOAD PROOF OF PAYMENT...")

These are stored in `tenant_settings` JSONB as `email_system_name` and `email_note`.

## Files affected

| File | Change |
|------|--------|
| `src/pages/admin/settings/EmailAccountsTab.tsx` | Add mode selector, platform identity card, system name/note fields |
| `supabase/functions/_shared/email-queue.ts` | Read `email_send_method` setting in resolver |
| `supabase/functions/email-dispatcher/index.ts` | Redeploy after queue change |
| `mem://infrastructure/email-system` | Update with dual-mode documentation |

## Not in scope (future)

- Gmail/Microsoft OAuth connector for tenants (you mentioned covering it if it comes up)
- Subdomain-per-tenant CNAME setup (noted for future architecture)
- SPF/DKIM/DMARC verification UI for tenant-owned domains
