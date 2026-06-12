## Problem

The Microsoft connector is failing before it ever calls Graph sendMail. The access-token refresh request returns `AADSTS90013`, while the stored refresh token is present (`refresh_len=1448`) and both worker client credentials are present.

There is also a separate, confirmed popup issue: Supabase Edge Functions rewrite `text/html` GET responses to `text/plain`, so the callback page is shown as raw source. Supabase documents this behaviour: `GET` requests returning `text/html` are rewritten to `text/plain`.

## Exact root issues to fix

1. **OAuth scope drift**
   - The original connector used Microsoft’s documented simple delegated Graph scopes: `offline_access Mail.Send User.Read`.
   - Recent changes switched the authorize and refresh flows to fully-qualified scopes (`https://graph.microsoft.com/Mail.Send`, etc.) and then changed refresh scope again.
   - Microsoft’s Graph delegated examples use `offline_access User.Read Mail.Read/Mail.Send` style scope strings for this flow, and refresh scope is optional/equivalent-or-subset.
   - We should stop being clever and use the same simple scope string for authorize, code exchange, and refresh.

2. **Possible client mismatch between Edge Function and Cloud Run worker**
   - The refresh token is bound to the user + OAuth client.
   - If the Edge Function receives the token with one `MICROSOFT_OAUTH_CLIENT_ID`, but the Cloud Run email worker refreshes it with a different `MICROSOFT_OAUTH_CLIENT_ID`, Microsoft rejects the refresh.
   - Current diagnostics only say `client_id_present=True`, not whether it is the same client as the one that minted the token.

3. **Callback HTML cannot render from a Supabase Edge Function GET**
   - Returning an HTML success page from the Edge Function is not reliable/supported; Supabase rewrites it to `text/plain`.
   - The callback should redirect to a normal React route in the app, which can render UI and `postMessage` the opener.

## Implementation plan

1. **Reset Microsoft OAuth scopes to the documented simple delegated flow**
   - In `supabase/functions/microsoft-oauth-connect/index.ts`, set the single scope constant back to:
     - `offline_access Mail.Send User.Read`
   - Use that exact value for:
     - authorization URL
     - authorization-code token exchange
   - Remove misleading comments about fully-qualified scopes being required.

2. **Reset worker refresh to the same scope string**
   - In `pdf-server/app/email/graph_oauth_client.py`, set refresh scope to:
     - `offline_access Mail.Send User.Read`
   - Keep the refresh-token `.strip()` because it is harmless and prevents whitespace corruption.
   - On refresh success, if Microsoft returns a replacement `refresh_token`, support returning it later; do not leave token rotation impossible.

3. **Add a safe client-id fingerprint diagnostic**
   - Add a non-secret fingerprint of the worker `MICROSOFT_OAUTH_CLIENT_ID` to email diagnostics and refresh errors, e.g. first/last characters or SHA-256 prefix.
   - Add the same fingerprint to the Edge Function callback result metadata stored on the account if a suitable existing metadata field exists; if not, include it only in function logs and the worker `/health` response.
   - This lets us prove whether the connector and worker are using the same Entra app without exposing secrets.

4. **Replace Edge Function callback HTML with an app redirect**
   - Add a React route such as `/oauth/microsoft/callback-result`.
   - The Edge Function callback will redirect to that route with only safe query params: `success`, `email`, or `error`.
   - The React page will render the connected/failed message and run `window.opener.postMessage(...)`, then close the popup.
   - This fixes the raw HTML source screenshot without fighting Supabase’s `text/html` rewrite.

5. **Keep connector architecture simple**
   - Do not reintroduce `platform-graph-configure`.
   - Do not add app-only Mail.Send / Exchange RBAC.
   - Do not add another connector type.
   - Keep platform and tenants on the same Microsoft delegated OAuth connector; platform is just `scope: "platform"`.

6. **Validation after implementation**
   - Deploy `microsoft-oauth-connect` after the Edge Function change.
   - Redeploy the Cloud Run email worker code path via the existing GitHub workflow.
   - Reconnect `hello@document-centre.com` so the refresh token is minted with the reset scope flow.
   - Send a test email.
   - Expected outcome:
     - popup renders as a normal app page, not source code;
     - Sent Mail row goes `sent` via `graph_oauth`;
     - if it still fails, the error will show a safe client-id fingerprint so we can immediately confirm/exclude OAuth-client mismatch.