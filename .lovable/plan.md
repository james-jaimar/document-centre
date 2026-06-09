# Seamless tenant email onboarding: SMTP + Gmail OAuth + Microsoft OAuth

Goal: a tenant admin can land on Settings → Email Accounts and connect their mailbox in **one click** for Gmail, in **one click** for Microsoft 365 / Outlook, or by pasting host/port/user/pass for any other SMTP provider — no platform-admin intervention, no copying refresh tokens around.

## Current state

- **SMTP**: fully working. Postnet stores use this.
- **Gmail OAuth**: edge function `gmail-oauth-connect` already implements authorize / callback / disconnect; UI wiring + Google Cloud OAuth client are the only missing pieces.
- **Microsoft Graph**: only the Document Centre mailbox is wired, using app-only (`client_credentials`) creds entered manually into `email_accounts`. There is **no self-serve OAuth connect** for tenants today.
- **Python worker**: SMTP + Graph + Gmail client code is already ported (`pdf-server/app/email/{smtp,graph,gmail}_client.py`). Just needs the two OAuth client secrets in GCP Secret Manager to actually send Gmail.

## What changes

### 1. Pick the right Microsoft auth model for tenants

Use **delegated OAuth (authorization_code + refresh_token) on a multi-tenant Azure app** — same shape as Gmail. Why not app-only / client_credentials per-tenant?

- Client credentials require each tenant to register their own Azure app and paste tenant_id / client_id / client_secret. That is the opposite of "seamless onboarding".
- Multi-tenant delegated OAuth means we register **one** Azure app, tenants click "Connect Microsoft", grant consent once, and we store a refresh token in Vault — identical UX to Gmail.
- `Mail.Send` delegated scope (optionally `offline_access`, `User.Read`) is enough for `sendMail`.

DC's existing app-only Graph account keeps working unchanged — the worker already branches on `transport == 'graph'` and reads `graph_client_secret_id`. We will introduce a parallel transport `graph_oauth` for the tenant flow.

### 2. Schema: add `graph_oauth` transport

Migration on `email_accounts`:
- Extend the allowed `transport` values to include `graph_oauth` (the column is plain text — no enum migration needed; update any CHECK constraint if present).
- No new columns: `graph_oauth` reuses `oauth_refresh_token_secret_id` and `oauth_email` (same as Gmail).
- Backfill: none — DC's existing row stays `transport='graph'`.

### 3. New edge function: `microsoft-oauth-connect`

Mirror `gmail-oauth-connect` exactly. Actions: `authorize`, `callback`, `disconnect`. Endpoints:
- Authorize: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` with `scope=offline_access Mail.Send User.Read`, `response_type=code`, `prompt=consent`.
- Token: `https://login.microsoftonline.com/common/oauth2/v2.0/token`.
- Userinfo (to capture mailbox address): `GET https://graph.microsoft.com/v1.0/me` → `mail` or `userPrincipalName`.
- Store refresh token in Vault via existing `create_email_account_secret` RPC.
- Upsert `email_accounts` row with `transport='graph_oauth'`, `oauth_email=<mailbox>`.

Secrets needed (platform-level, added once via `add_secret`):
- `MICROSOFT_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`

### 4. Python worker: add `graph_oauth` sender

`pdf-server/app/email/graph_oauth_client.py` (new, ~80 lines):
- Refresh access token using stored refresh_token + `MICROSOFT_OAUTH_CLIENT_ID`/`SECRET` (same pattern as `gmail_client._refresh_access_token`).
- Call `POST https://graph.microsoft.com/v1.0/me/sendMail` (note: `/me`, not `/users/{sender}` — delegated tokens are scoped to the signed-in mailbox).
- Reuse the message-builder logic already in `graph_client.send_graph` (factor the body assembly into a shared helper).

`credentials.py`:
- Add `GraphOAuthCreds` dataclass; in `_build_from_row` add a branch for `transport == 'graph_oauth'` reading `oauth_refresh_token_secret_id` + `oauth_email`, plus `microsoft_oauth_client_id()` / `_secret()` env helpers.

`email_tasks.py` dispatch shim:
```python
elif creds.kind == "graph_oauth": send_graph_oauth(...)
```

Cloud Run worker env (`.github/workflows/pdf-server-deploy.yml`):
- Add `MICROSOFT_OAUTH_CLIENT_ID` + `_SECRET` and `GMAIL_OAUTH_CLIENT_ID` + `_SECRET` as Secret Manager refs on `pdf-worker-emails`.

### 5. UI: one-click connect buttons

`src/pages/admin/settings/EmailAccountsTab.tsx` already knows about `gmail_oauth` and `graph` transports. Add:
- A **"Connect Microsoft 365 / Outlook"** button alongside the existing "Connect Gmail" button. Calls `microsoft-oauth-connect` with `action=authorize`, opens the returned URL in a new window, listens for the popup `postMessage` (or polls `email_accounts`) to refresh the list.
- Surface `graph_oauth` rows in the list with a Microsoft icon, the mailbox address, and a "Disconnect" action.
- Same panel on `BranchEmailAccountsPanel.tsx` (branch-scoped accounts).

Auth callback page: both `gmail-oauth-connect` and `microsoft-oauth-connect` redirect back to a small `/oauth/email-callback` route that POSTs `{code, state, provider}` to the matching function and then closes itself. (Reuse one route; branch by `provider` query param.)

### 6. Remove edge-dispatcher kicks (carried over from prior plan)

Replace the three fire-and-forget `email-dispatcher` POSTs (`send-email`, `send-order-email`, `submit-contact`) with a POST to the Cloud Run beat route so newly enqueued rows send within ~1 s. Already drafted via `_shared/email-kick.ts`; ensure all three call-sites use it.

### 7. Documentation / setup checklist

Add `docs/EMAIL_OAUTH_SETUP.md` covering, for the platform admin:

**Google Cloud (Gmail OAuth):**
1. Create OAuth client ID (type: Web application).
2. Authorized redirect URI: `https://<supabase-ref>.functions.supabase.co/gmail-oauth-connect`.
3. Scopes requested at runtime: `gmail.send email profile`. App needs to be either in test mode (limited to listed test users) or submitted for verification before tenants can connect.
4. Copy client ID + secret → Supabase Edge Secrets **and** GCP Secret Manager (worker reads from GCP).

**Microsoft Entra (Microsoft OAuth):**
1. Register app, **multi-tenant + personal accounts**.
2. Redirect URI: `https://<supabase-ref>.functions.supabase.co/microsoft-oauth-connect`.
3. API permissions (delegated): `Mail.Send`, `User.Read`, `offline_access`. Grant admin consent for our own tenant; tenants grant consent at first connect via the consent screen.
4. Generate client secret → store in Supabase Edge Secrets + GCP Secret Manager.

## Out of scope

- No changes to DC's existing app-only Graph row (`transport='graph'`). It keeps working.
- No marketing / bulk email features.
- No UI to switch a tenant's transport — they just disconnect and reconnect via the relevant provider button.

## Verification

1. Tenant admin clicks "Connect Microsoft" → consent screen → returns → row appears with `transport='graph_oauth'`, `oauth_email` populated.
2. Send a test email → `email_outbox` goes `pending → sent` within 5 s; `provider='graph_oauth'`; `message_id` populated from `x-ms-request-id`.
3. Same for Gmail.
4. SMTP path unchanged — Postnet test send still goes via `transport='smtp'`.
5. DC's existing Graph row still sends successfully via `transport='graph'` (app-only).

## Files touched

- new: `supabase/functions/microsoft-oauth-connect/index.ts`
- new: `pdf-server/app/email/graph_oauth_client.py`
- new: `docs/EMAIL_OAUTH_SETUP.md`
- edit: `supabase/functions/gmail-oauth-connect/index.ts` (no functional change; align callback redirect with shared route if needed)
- edit: `src/pages/admin/settings/EmailAccountsTab.tsx`
- edit: `src/components/branch/BranchEmailAccountsPanel.tsx`
- edit: `src/App.tsx` (+ new `src/pages/OAuthEmailCallback.tsx`)
- edit: `pdf-server/app/email/credentials.py`
- edit: `pdf-server/app/email/tasks/email_tasks.py`
- edit: `pdf-server/app/email/graph_client.py` (extract shared message-builder)
- edit: `.github/workflows/pdf-server-deploy.yml` (4 new Secret Manager env refs)
- edit: `supabase/functions/send-email/index.ts`, `send-order-email/index.ts`, `submit-contact/index.ts` (swap dispatcher kick for worker beat kick, if not already done)
- migration: extend `email_accounts.transport` allowed values to include `graph_oauth`

## What the platform admin (you) needs to do once, manually

1. **Google Cloud Console**: create an OAuth 2.0 Client ID under the same Google account that will manage the project long-term. Reuse the existing OAuth client if you can find it; otherwise create new (no existing tokens to invalidate since no Gmail tenants are live yet).
2. **Microsoft Entra admin center**: register a new multi-tenant app, add redirect URI, generate a client secret.
3. Paste the four values into Supabase Edge Secrets when prompted, and `gcloud secrets create` the same four into GCP Secret Manager for the worker (I will give you the exact commands once the code is in).

Everything else — schema migration, edge functions, UI, worker code, deploy config — I do in code.
