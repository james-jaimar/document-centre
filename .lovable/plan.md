## What I found

This is no longer a scope-theory problem. The live evidence shows the connector is using two different Microsoft Entra app registrations:

- Microsoft OAuth callback succeeded at **07:21** with `client_fp=c1932231`.
- The email worker then tried to refresh that token with `client_fp=b88cebfd`.
- A Microsoft refresh token is bound to the OAuth client that minted it. Refreshing it with a different `client_id`/secret is invalid, so Microsoft returns `AADSTS90013`.

That is real forward movement: the current failure is explained by config drift between the Supabase Edge Function and the Cloud Run email worker.

## Documentation baseline checked

Microsoft docs line up with this:

- Authorization code flow requires the same `redirect_uri` during code exchange as was used for authorization.
- Refresh token requests use `grant_type=refresh_token`, the same client identity, and an optional `scope` that must be equivalent/subset of the original scopes.
- Microsoft Graph short scopes are valid: Microsoft explicitly says that if the resource identifier is omitted, the resource is assumed to be Microsoft Graph, so `Mail.Send User.Read` is equivalent to Graph-scoped permissions.
- Refresh tokens may rotate; if a new `refresh_token` is returned, the old one should be discarded and replaced.

## Plan

1. **Stop changing OAuth code first**
   - Keep the connector on one delegated OAuth flow.
   - Keep `/common`, `authorization_code`, `refresh_token`, `Mail.Send`, `User.Read`, and `offline_access`.
   - Do not reintroduce app-only Graph, RBAC, or another connector.

2. **Align the two Microsoft client credentials**
   - Make the Cloud Run email worker use the same `MICROSOFT_OAUTH_CLIENT_ID` and `MICROSOFT_OAUTH_CLIENT_SECRET` as the Supabase Edge Function.
   - Target state: the worker refresh error/health diagnostic must show `client_fp=c1932231`, matching the OAuth callback log.
   - This is the primary fix.

3. **Redeploy only what actually needs redeploying**
   - Redeploy/update `pdf-worker-emails` so it picks up the corrected GCP Secret Manager values.
   - If the worker still serves an old revision, move traffic to latest.
   - No frontend rewrite and no database schema change are needed for the root cause.

4. **Reconnect once after config is aligned**
   - Reconnect `hello@document-centre.com` after the fingerprints match.
   - This mints a fresh refresh token using the same Entra app that the worker will later use for refresh.

5. **Send one test email and verify the exact failure point**
   - Expected: outbox row moves to `sent` via `graph_oauth`.
   - If it still fails, the next error should no longer be `AADSTS90013` with mismatched fingerprints; any remaining error would be the next true issue, not the same loop.

6. **Add drift guardrails in repo**
   - Update deployment verification so it does not merely check that Microsoft secrets are mounted; it must expose/check the non-secret client fingerprint for `pdf-worker-emails` too.
   - Add a health/debug endpoint or worker log line for the email worker’s OAuth client fingerprint, because the public API `/health` currently does not prove what the private email worker is using.
   - Add a short note to the OAuth setup doc: Supabase Edge secrets and GCP Secret Manager secrets must be the same Entra app; mismatched fingerprints cause `AADSTS90013`.

7. **Add refresh-token rotation support as a follow-up hardening step**
   - When Microsoft returns a replacement `refresh_token`, persist it back to Vault and update the email account secret reference.
   - This is not the current root cause, but it is a documented best-practice gap and prevents future token expiry/rotation failures.

## Acceptance criteria

- The Edge Function callback fingerprint and email worker fingerprint match.
- `hello@document-centre.com` reconnects cleanly.
- A platform test email sends successfully via `graph_oauth`.
- Deployment checks would catch the same client-ID mismatch before another three-day loop.