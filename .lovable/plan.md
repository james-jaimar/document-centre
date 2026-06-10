## Goal

Get the Document Centre Demo invoice email (`INV-00082` → `jimmybhawkins@gmail.com`) actually sent through the new Microsoft 365 OAuth mailbox.

## Root cause

The failed `email_outbox` row has `error_message = "credential_error: transport graph_oauth not yet implemented in pdf-server"`. That string is **not in the current repo** — the deployed `pdf-worker-emails` Cloud Run service is running an older image that pre-dates the `graph_oauth` transport. The repo (`pdf-server/app/email/credentials.py`, `graph_oauth_client.py`, `tasks/email_tasks.py`) already implements it correctly; the deployed container just needs rebuilding.

## Steps

1. **Verify worker env vars**
   Confirm the `pdf-worker-emails` Cloud Run service has `MICROSOFT_OAUTH_CLIENT_ID` and `MICROSOFT_OAUTH_CLIENT_SECRET` set (same secret values used by the `microsoft-oauth-connect` edge function). If missing, add them — without these the refresh-token exchange in `graph_oauth_client._refresh_access_token` will fail.

2. **Rebuild and redeploy `pdf-worker-emails`**
   Trigger a Cloud Build / `gcloud run deploy` of the emails worker image so it picks up the current `pdf-server/app/email/*` code (graph_oauth_client, credentials, tasks/email_tasks). No code changes required — just a fresh image.

3. **Re-queue the stuck invoice email**
   ```sql
   update public.email_outbox
   set status = 'queued',
       attempts = 0,
       error_message = null,
       next_attempt_at = now()
   where id = '8e33a1f7-60bb-478d-bfdc-e233bba879fd';
   ```
   The beat tick will claim it and the redeployed worker will send via Microsoft Graph `/me/sendMail` (saves to the user's Sent Items).

4. **Verify**
   - Watch the row transition `queued → sending → sent` in Sent Mail.
   - Confirm `jimmybhawkins@gmail.com` receives it and a copy appears in the connected Microsoft 365 mailbox's Sent Items.
   - If it fails again, the new `error_message` will now come from the live code (e.g. `graph_oauth_auth 401: …` or `graph_oauth send …`) and tell us exactly where in the OAuth flow it broke.

## What this does NOT change

- No application code edits — the fix is purely a worker redeploy.
- No DB schema changes.
- The `send-order-email` / `email-account-manage` / dispatcher logic from the last round stays exactly as-is.

## Risks

- If the secrets in step 1 are missing or wrong, the redeploy will still fail — but with a clear `graph_oauth_auth` error instead of the misleading "not yet implemented" message.
- Worker redeploy is the GCP-side action; I can apply the SQL re-queue, but the Cloud Run rebuild needs to happen in the pdf-server deployment pipeline.
