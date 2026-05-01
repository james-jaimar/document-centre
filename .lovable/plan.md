
# Gmail OAuth Sending + Tenant Custom Domain Architecture

## Part 1: Gmail OAuth Email Sending

### 1a. Database Migration

Add columns to `email_accounts`:
- `transport` text NOT NULL DEFAULT 'smtp' — update existing CHECK to allow `('smtp', 'gmail_oauth', 'graph')`
- `oauth_refresh_token_secret_id` uuid (vault-stored refresh token)
- `oauth_email` text (the authorized Gmail address)
- Make `smtp_host` and `smtp_username` nullable (only required for SMTP transport)
- Update the `validate_email_account_transport` trigger function to handle `gmail_oauth` transport validation

### 1b. Edge Function: `gmail-oauth-connect`

Handles two actions:
- **authorize**: Returns a redirect URL to Google's OAuth consent screen with scope `gmail.send`, using platform-level credentials from Vault (`gmail_oauth_client_id`, `gmail_oauth_client_secret`)
- **callback**: Exchanges the auth code for tokens, stores refresh token in Vault, upserts `email_accounts` row with `transport = 'gmail_oauth'`

Callback redirects back to the tenant admin settings page with a success/error indicator.

### 1c. Update `email-dispatcher`

Add a `gmail_oauth` path in `resolveCreds` alongside existing `smtp` and `graph`:
- Load refresh token from Vault
- Exchange for access token via Google's token endpoint
- Return a `GmailCreds` type

Add `sendViaGmail` function:
- Builds RFC 2822 message from the outbox row
- Base64url-encodes it
- POSTs to `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`
- Handles token expiry/revocation errors gracefully

### 1d. Update `email-account-manage`

Add support for `transport` in the upsert action. When `transport = 'gmail_oauth'`, skip SMTP field validation. Add a `disconnect_gmail` action that removes the Vault secret and resets the row.

### 1e. UI: EmailAccountsTab.tsx

Add a third card option for "Connect Gmail":
- Google-branded button that opens a popup to the `gmail-oauth-connect` Edge Function
- After connection: shows connected email, verified badge, disconnect action
- Update the `EmailAccount` interface to include `transport`, `oauth_email` fields

### 1f. Platform Secrets Required

Two new Vault secrets needed (one-time platform admin setup):
- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`

These come from a Google Cloud Console OAuth 2.0 Client configured with the `gmail.send` scope.

---

## Part 2: Tenant Custom Domain Architecture

### 2a. Hook: `useTenantFromHost`

New hook that reads `window.location.hostname` and resolves a tenant:
1. Check if hostname matches `{slug}.document-centre.com` — extract slug, look up tenant
2. Check if hostname matches a `tenants.custom_domain` value — look up tenant by domain
3. If no match, return null (fall through to path-based `/t/:slug` routing)

### 2b. Component: `StorefrontHostRouter`

Root-level component added before the main `<Routes>`:
- Uses `useTenantFromHost` to check if the current hostname resolves a tenant
- If yes, renders the `CustomerLayout` with the resolved tenant context (bypassing `/t/:slug` path requirement)
- If no, renders the normal router tree

### 2c. App.tsx Integration

Wrap the router tree so that host-based resolution takes priority over path-based routing. The existing `/t/:slug/*` routes remain as fallback.

### 2d. Admin UI: DomainsTab

New tab in tenant admin settings:
- Shows the default platform subdomain (`{slug}.document-centre.com`) as read-only
- Custom domain input field — saves to `tenants.custom_domain`
- CNAME instructions panel: "Create a CNAME record pointing `store.yourdomain.co.za` to `{slug}.document-centre.com`"
- "Verify DNS" button that calls the `verify-domain` Edge Function

### 2e. Edge Function: `verify-domain`

Accepts a domain and tenant slug. Performs a DNS lookup (Deno `Deno.resolveDns`) to check if the CNAME resolves to `{slug}.document-centre.com` or the server IP. Returns success/failure with diagnostic info.

### 2f. AdminSettings.tsx

Add a "Domains" tab (Globe icon) to the existing settings tabs list, rendering `DomainsTab`.

### 2g. Memory Updates

- Update `mem://infrastructure/email-system` with Gmail OAuth details
- Update `mem://saas/storefront-url-strategy` with subdomain strategy and `document-centre.com` references

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/xxx.sql` | Add transport/oauth cols, update trigger |
| `supabase/functions/gmail-oauth-connect/index.ts` | Create |
| `supabase/functions/email-dispatcher/index.ts` | Edit — add Gmail path |
| `supabase/functions/email-account-manage/index.ts` | Edit — handle gmail_oauth |
| `src/pages/admin/settings/EmailAccountsTab.tsx` | Edit — Gmail card |
| `src/hooks/useTenantFromHost.ts` | Create |
| `src/components/StorefrontHostRouter.tsx` | Create |
| `src/App.tsx` | Edit — add host routing |
| `src/pages/admin/settings/DomainsTab.tsx` | Create |
| `src/pages/admin/AdminSettings.tsx` | Edit — add Domains tab |
| `supabase/functions/verify-domain/index.ts` | Create |
| Memory files | Update email-system + storefront-url-strategy |

## Note on Infrastructure

The subdomain routing code will be ready immediately, but it requires ops-level setup before it works in production:
- Wildcard DNS `*.document-centre.com` pointing to the AWS Amplify deployment
- Wildcard or on-demand SSL certificate provisioning
- AWS Amplify rewrite rules to serve the SPA for all subdomains
