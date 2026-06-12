## Goal

Get the platform Microsoft 365 mailbox (`hello@document-centre.com`) actually sending. The OAuth connect succeeds — only the refresh-token call from the worker fails with `AADSTS90013: Invalid input received from the user`.

## Root cause hypothesis

The worker requests fewer scopes at refresh time than were consented at authorize time. Microsoft can return AADSTS90013 in that mismatch. Aligning refresh scopes to the original consent set is the documented safe pattern.

Secondary risk: the refresh token is read from Vault and could carry hidden whitespace; we already `.strip()` it, but we don't log the length, so a truncated/empty token would look identical to a bad-input error.

## Changes (code only — no schema, no UI behaviour change)

1. `pdf-server/app/email/graph_oauth_client.py`
   - Change `SCOPES` to mirror the consent set used by `microsoft-oauth-connect`:
     `offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read`
   - On refresh failure, include `refresh_len=<n>` and `client_id_present=<bool>` in the raised error message (no secrets logged) so the Sent Mail row tells us if the token was empty/short.

2. No changes to `microsoft-oauth-connect`, `credentials.py`, the UI, or the database.

## Validation

1. After deploy, click "Send test" again from Platform Settings → Email.
2. Expected: outbox row turns `sent`. If it still fails, the new error string will show `refresh_len` so we know whether to look at Vault storage vs Microsoft-side.

## Out of scope

- No new connectors, no app-only path, no Exchange RBAC.
- Not changing the multi-tenant Azure app registration.
