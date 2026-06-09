# Restore per-tenant email on Cloud Run

Goal: make `pdf-worker-emails` send via SMTP, Microsoft Graph, and Gmail OAuth — same fallback chain the retired edge dispatcher used — so Postnet Sandton (SMTP/Graph) and the Document Centre demo (Outlook/Graph) start sending again without any new infra or third-party service.

## What changes

### 1. New transport clients (Python port of edge code)

- `pdf-server/app/email/graph_client.py`
  - `get_access_token(creds)` → POST `login.microsoftonline.com/{tenant}/oauth2/v2.0/token` (client_credentials).
  - `send_graph(creds, row, attachments, ...)` → POST `graph.microsoft.com/v1.0/users/{sender}/sendMail`.
  - Map errors: `401/403` → `PermanentSmtpError` (auth, do not retry); `429` → `TransientSmtpError` with Retry-After; other 5xx/network → `TransientSmtpError`.
  - Returns the `x-ms-request-id` header as `message_id`.

- `pdf-server/app/email/gmail_client.py`
  - `refresh_access_token(creds)` → POST `oauth2.googleapis.com/token` (refresh_token grant).
  - `build_rfc2822(...)` → identical MIME assembly to the TS version (text/html, multipart/related for inline cids, multipart/mixed for regular attachments).
  - `send_gmail(...)` → POST `gmail.googleapis.com/gmail/v1/users/me/messages/send` with base64url `raw`.
  - Same 401/403/429 → permanent/transient mapping.

Both use `httpx` (already in `requirements.txt`); no new dependencies.

### 2. Credential layer

`pdf-server/app/email/credentials.py`:
- `AccountCreds = Union[SmtpCreds, GraphCreds, GmailCreds]` (add `kind` discriminator already present).
- `_build_from_row` branches on `transport` (`smtp` / `graph` / `gmail_oauth`) and reads the right vault secret IDs (`graph_client_secret_id`, `oauth_refresh_token_secret_id`) via the existing `read_email_account_secret` RPC.
- `resolve_account_id_for_row`: drop the `transport == 'smtp'` filter so Graph/Gmail rows are picked up. Keep the branch → tenant fallback chain.
- Gmail client_id/secret come from worker env: `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET` (same env names the edge fn used).

### 3. Dispatch shim

`pdf-server/app/tasks/email_tasks.py` → in `send_email`, after `get_account_creds`:
```python
if creds.kind == "smtp":   send_smtp(...)
elif creds.kind == "graph": send_graph(...)
elif creds.kind == "gmail_oauth": send_gmail(...)
```
Reuse the existing `account_slot` concurrency wrapper, metrics, retry logic, and mark_sent/mark_failed paths unchanged.

### 4. Remove duplicate-dispatcher race

Three edge functions still fire-and-forget POST to `email-dispatcher` after enqueueing:
- `supabase/functions/send-email/index.ts:72`
- `supabase/functions/send-order-email/index.ts:506`
- `supabase/functions/submit-contact/index.ts:201`

Replace each with a fire-and-forget POST to the Cloud Run worker's existing beat route (`POST {PDF_API_URL}/beat/scan-email-outbox` with `EMAIL_NOTIFY_TOKEN`) so a freshly enqueued row sends within ~1 s instead of waiting for the 30 s scheduler tick. If `PDF_API_URL` or token env is missing, just skip — the scheduler picks it up.

### 5. Worker env

Add to `pdf-worker-emails` in `.github/workflows/pdf-server-deploy.yml`:
- `GMAIL_OAUTH_CLIENT_ID` and `GMAIL_OAUTH_CLIENT_SECRET` as Secret Manager refs (same secret names already used by the edge fn — needs verification that they exist as GCP secrets; if not, user adds them).
- No other env changes required.

### 6. Decommission edge dispatcher (deferred, opt-in)

Not done in this pass. Once Postnet Sandton and DC demo send successfully on the new path, follow `docs/VPS_DECOMMISSION.md` §6 to drop the `notify_email_dispatcher` trigger + cron and delete the `email-dispatcher` function. Until then it remains as a no-op safety net (rows are claimed by whichever dispatcher gets there first; with the kicks removed in step 4 that will be Python).

## Out of scope

- No UI changes.
- No new tests beyond a manual send to Postnet Sandton + DC demo after deploy.
- No switch to SendGrid/Resend/Mailgun.
- No schema changes (the `email_accounts` columns the edge fn read already exist).

## Post-deploy verification

1. `gcloud run services describe pdf-worker-emails ... --format='yaml(status.traffic,status.latestReadyRevisionName)'` — live revision matches latest.
2. Send a test order on Postnet Sandton → row in `email_outbox` goes `pending → sent` within 5 s; `provider` column shows `graph`; `message_id` populated.
3. Same on the DC demo (hello@documentcentre.com / Graph).
4. Send a row on a tenant configured with Gmail OAuth (if available) → `provider=gmail_oauth`, `message_id` is a Gmail message id.
5. Confirm `email_failed_total{reason="config_missing"}` stops climbing.

## Files touched

- new: `pdf-server/app/email/graph_client.py`
- new: `pdf-server/app/email/gmail_client.py`
- edited: `pdf-server/app/email/credentials.py`
- edited: `pdf-server/app/tasks/email_tasks.py`
- edited: `supabase/functions/send-email/index.ts`
- edited: `supabase/functions/send-order-email/index.ts`
- edited: `supabase/functions/submit-contact/index.ts`
- edited: `.github/workflows/pdf-server-deploy.yml` (Gmail OAuth env for emails worker)
