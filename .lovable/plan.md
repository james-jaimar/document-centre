
# Plan: Document Memory + Gmail OAuth + Custom Domains

## Step 0 — Save Production Domain to Memory (immediate)

Create `mem://infrastructure/hosting-and-domains` documenting:
- **Production URL**: `https://document-centre.com`
- **Hosting**: AWS Amplify, deployed from the GitHub repo Lovable commits to
- Lovable domains (`document-centre.lovable.app`, `document-centre.jaimar.dev`) are dev/preview only
- All user-facing references (emails, branding, platform sender addresses) should reference `document-centre.com`
- Future wildcard subdomain infrastructure targets AWS Amplify, not Lovable hosting

Update `mem://index.md` to include this reference.

Also update `mem://infrastructure/email-system` to note that the production platform sender will be under `document-centre.com`, not `jaimar.dev`.

---

## Step 1 — Gmail OAuth Email Sending

### Database
- Add columns to `email_accounts`: `transport` (text, default `'smtp'`, check `IN ('smtp','gmail_oauth','graph')`), `oauth_refresh_token_secret_id` (uuid), `oauth_email` (text)
- Make SMTP-specific columns (`smtp_host`, `smtp_username`) nullable (only required when `transport = 'smtp'`)

### Edge Function: `gmail-oauth-connect`
- Handles OAuth authorize redirect + callback using platform-level Google OAuth credentials (stored in Vault)
- Scope: `https://www.googleapis.com/auth/gmail.send` (send-only)
- On callback: stores refresh token in Vault, upserts `email_accounts` row with `transport = 'gmail_oauth'`

### Dispatcher update
- Add `sendViaGmail` path in `email-dispatcher` alongside existing SMTP and Graph paths
- Uses refresh token to get access token, then calls Gmail API `messages/send`

### UI (`EmailAccountsTab.tsx`)
- Third send-method card: "Connect Gmail" with Google branding
- "Connect with Google" button opens OAuth popup
- After connection: shows connected email, verified badge, disconnect action

---

## Step 2 — Tenant Custom Domain Architecture

### Phase 1 — Host-based tenant resolution (code)
- `useTenantFromHost` hook: checks `window.location.hostname` against `{slug}.document-centre.com` pattern and `tenants.custom_domain` column
- `StorefrontHostRouter` component at app root for host-based routing
- Falls through to existing `/t/:slug` path routing if no host match

### Phase 2 — Admin domain management UI
- "Domains" section in tenant settings
- Shows default platform subdomain (`{slug}.document-centre.com`, read-only)
- Custom domain input with CNAME instructions
- DNS verification button via Edge Function

### Phase 3 — Infrastructure (ops, outside Lovable)
- Wildcard DNS `*.document-centre.com` on AWS Amplify
- Wildcard or on-demand SSL
- Code from Phases 1-2 will be ready; this phase enables it in production

---

## Files to create/modify

| File | Action |
|------|--------|
| `mem://infrastructure/hosting-and-domains` | Create — production domain reference |
| `mem://index.md` | Update — add hosting reference |
| `mem://infrastructure/email-system` | Update — note production domain |
| `supabase/migrations/xxx.sql` | Add transport, OAuth cols to email_accounts |
| `supabase/functions/gmail-oauth-connect/index.ts` | Create — OAuth flow |
| `supabase/functions/email-dispatcher/index.ts` | Edit — Gmail send path |
| `supabase/functions/email-account-manage/index.ts` | Edit — handle transport |
| `src/pages/admin/settings/EmailAccountsTab.tsx` | Edit — Gmail card |
| `src/hooks/useTenantFromHost.ts` | Create — host-based resolution |
| `src/components/StorefrontHostRouter.tsx` | Create — host routing |
| `src/App.tsx` | Edit — add host routing |
| `src/pages/admin/settings/DomainsTab.tsx` | Create — domain management |
| `supabase/functions/verify-domain/index.ts` | Create — DNS check |
| `mem://saas/storefront-url-strategy` | Update — subdomain strategy |
