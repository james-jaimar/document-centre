# Email OAuth Setup (Platform Admin)

This is the one-time setup the platform admin (you) performs so tenants can self-connect their Gmail or Microsoft 365 mailbox with a single click. SMTP needs none of this — tenants just paste host/port/user/pass.

## Why this matters

The `/admin/settings` Email Accounts panel shows three connect paths to tenants:

| Path | Tenant action | Platform admin one-time setup |
|---|---|---|
| SMTP | Paste host/port/user/pass | none |
| Gmail OAuth | Click "Sign in with Google" | this doc, section 1 |
| Microsoft 365 OAuth | Click "Sign in with Microsoft" | this doc, section 2 |

The OAuth client IDs/secrets are shared across **all** tenants — one Google OAuth client and one Microsoft Entra app handle every tenant's consent flow. Refresh tokens are stored per-account in Supabase Vault. The Cloud Run emails worker (`pdf-worker-emails`) reads the same client ID/secret from GCP Secret Manager to refresh those tokens at send time.

---

## 1. Gmail OAuth (one-time)

### Google Cloud Console

1. Pick or create a long-lived Google Cloud project (this is independent of `project-59a14b18-...` — Gmail OAuth lives in the Google project that "owns" the consent screen).
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name: Document Centre. Support email: yours.
   - Authorized domains: add the root domain you ship from (e.g. `document-centre.com`).
   - Scopes: `.../auth/gmail.send`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`.
   - **Publish** the app (test mode caps you at ~100 listed test users; published needs Google verification for the `gmail.send` sensitive scope — start the verification request early).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URI: `https://lcvdhtaqoumyokjqaqfw.functions.supabase.co/gmail-oauth-connect`
   - Save → copy the **Client ID** and **Client secret**.

### Store the secrets

**Supabase Edge Secrets** (used by the edge function):
- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`

Add via the Lovable secrets tool (the agent will prompt you).

**GCP Secret Manager** (used by the Cloud Run worker `pdf-worker-emails`):

```bash
echo -n "<client id>"     | gcloud secrets create GMAIL_OAUTH_CLIENT_ID     --data-file=- --replication-policy=automatic --project=project-59a14b18-b4df-4c6b-b09
echo -n "<client secret>" | gcloud secrets create GMAIL_OAUTH_CLIENT_SECRET --data-file=- --replication-policy=automatic --project=project-59a14b18-b4df-4c6b-b09

SA=$(gcloud run services describe pdf-worker-emails --region=africa-south1 --project=project-59a14b18-b4df-4c6b-b09 --format='value(spec.template.spec.serviceAccountName)')
for s in GMAIL_OAUTH_CLIENT_ID GMAIL_OAUTH_CLIENT_SECRET; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$SA" \
    --role=roles/secretmanager.secretAccessor \
    --project=project-59a14b18-b4df-4c6b-b09
done
```

The next deploy of `pdf-server-deploy.yml` will detect both secrets and mount them on `pdf-worker-emails` automatically. Re-run the workflow or wait for the next push.

---

## 2. Microsoft 365 / Outlook OAuth (one-time)

### Microsoft Entra admin center

1. Go to **Microsoft Entra admin center → Applications → App registrations → New registration**:
   - Name: Document Centre.
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (multi-tenant + MSAs). This is what makes one app work for every tenant.
   - Redirect URI: Platform = **Web**, value = `https://lcvdhtaqoumyokjqaqfw.functions.supabase.co/microsoft-oauth-connect`
   - Register → copy the **Application (client) ID**.
2. **Certificates & secrets → New client secret** → copy the **Value** immediately (you cannot see it again).
3. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**:
   - `Mail.Send`
   - `User.Read`
   - `offline_access`
   - (`openid`, `profile`, `email` are added implicitly by `User.Read`.)
4. (Optional) Grant admin consent for your own directory so internal Document Centre staff don't see the consent screen each time.

### Store the secrets

**Supabase Edge Secrets**:
- `MICROSOFT_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_SECRET`

**GCP Secret Manager** (used by the Cloud Run worker):

```bash
echo -n "<client id>"     | gcloud secrets create MICROSOFT_OAUTH_CLIENT_ID     --data-file=- --replication-policy=automatic --project=project-59a14b18-b4df-4c6b-b09
echo -n "<client secret>" | gcloud secrets create MICROSOFT_OAUTH_CLIENT_SECRET --data-file=- --replication-policy=automatic --project=project-59a14b18-b4df-4c6b-b09

SA=$(gcloud run services describe pdf-worker-emails --region=africa-south1 --project=project-59a14b18-b4df-4c6b-b09 --format='value(spec.template.spec.serviceAccountName)')
for s in MICROSOFT_OAUTH_CLIENT_ID MICROSOFT_OAUTH_CLIENT_SECRET; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$SA" \
    --role=roles/secretmanager.secretAccessor \
    --project=project-59a14b18-b4df-4c6b-b09
done
```

The Supabase Edge secrets and GCP Secret Manager values must be the **same**
Microsoft Entra app registration. A refresh token minted by the Edge Function
cannot be refreshed by the worker with a different `client_id`; Microsoft
returns `AADSTS90013`. The non-secret fingerprint shown in logs/deploy output
must match on both sides. Current expected Microsoft OAuth client fingerprint:
`c1932231`.

If the GCP secret already exists but points at the wrong Entra app, replace the
latest secret versions rather than creating a second secret name:

```bash
printf '%s' '<same client id as Supabase MICROSOFT_OAUTH_CLIENT_ID>' |
  gcloud secrets versions add MICROSOFT_OAUTH_CLIENT_ID --data-file=- --project=project-59a14b18-b4df-4c6b-b09

printf '%s' '<same client secret as Supabase MICROSOFT_OAUTH_CLIENT_SECRET>' |
  gcloud secrets versions add MICROSOFT_OAUTH_CLIENT_SECRET --data-file=- --project=project-59a14b18-b4df-4c6b-b09
```

---

## 3. Verification

After all four secrets are in place:

1. Re-run the `pdf-server-deploy.yml` workflow (or push any commit under `pdf-server/`).
2. The deploy log should show both `Gmail OAuth secrets mounted on pdf-worker-emails.` and `Microsoft OAuth secrets mounted on pdf-worker-emails.`
3. The deploy summary should show `MICROSOFT_OAUTH_CLIENT_FP_ACTUAL` equal to `c1932231`.
4. As a tenant admin in `/admin/settings/email`:
   - Click **Sign in with Google** → consent screen → returns and shows the Gmail address with a "Connected" badge.
   - Click **Sign in with Microsoft** → consent screen → returns and shows the mailbox with "Connected".
5. Send a test order email; row in `email_outbox` should go `pending → sent` within 5 s with `provider = gmail_oauth` or `graph_oauth` and a populated `message_id`.

## Notes

- DC's existing `transport='graph'` (app-only client_credentials) row keeps working unchanged — the OAuth path is `transport='graph_oauth'`, a separate code path.
- Refresh tokens are bound to the consented scopes. If you ever change the requested scopes in the edge function, every connected tenant must reconnect.
- Personal Outlook.com / Hotmail accounts work via the same multi-tenant app because we use the `common` authority.
