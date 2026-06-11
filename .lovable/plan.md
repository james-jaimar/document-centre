## Diagnosis

This is not an SMTP problem. The working Postnet branch account is SMTP and should be left alone.

The failing rows are Microsoft Graph OAuth (`graph_oauth`) rows. The database shows the current Microsoft tenant test rows are failing before send, at Microsoft token refresh:

```text
graph_oauth_auth token 400
AADSTS90013: Invalid input received from the user
```

The app currently has two different “test” paths:

- Tenant/branch email test: uses `email-account-manage`, queues against the selected account id, and exercises the real account transport.
- Platform Microsoft tab test: uses `send-test-email`, which does not pass the selected Microsoft account id and is labelled as an SMTP/platform test. That makes platform testing confusing and can hit fallback behavior instead of the account being tested.

## Plan

1. **Stop touching SMTP**
   - Do not change SMTP code, Postnet branch config, or tenant SMTP behavior.
   - Keep `send_smtp` and the branch email-account flow intact.

2. **Fix Microsoft OAuth refresh to be less brittle**
   - Update the Microsoft OAuth sender so refresh-token exchange uses the standard Microsoft Graph scope form instead of the bare scope list.
   - Use the same redirect URI in refresh requests that was used when the token was issued.
   - Keep `/me/sendMail` for delegated Microsoft mail; do not switch to SMTP or app-only Graph.

3. **Make the platform Microsoft “Send test” use the selected Microsoft account**
   - Change the platform email tab test button to queue a test via `email-account-manage` with that account id, matching the tenant test path.
   - This makes the test prove the actual Microsoft mailbox/account works, instead of using the older generic `send-test-email` fallback.

4. **Allow platform-scoped account tests in `email-account-manage`**
   - Adjust authorization so platform admins can test/manage platform-scoped accounts where `tenant_id` is `null`.
   - Preserve the existing tenant/branch permission rules.

5. **Add clearer failure recording for Microsoft OAuth auth failures**
   - When Microsoft returns token-refresh auth errors, mark the account’s `last_error` so the UI shows “reconnect Microsoft 365 mailbox” rather than leaving the account looking verified.
   - Do not retry permanent Microsoft OAuth token failures as if they are worker/runtime failures.

6. **Deploy only the changed Edge Function**
   - Deploy `email-account-manage` after the Edge Function change.
   - No database migration should be needed for this fix.

7. **Validation after approval**
   - Re-run the platform Microsoft test and verify the newest outbox row has `email_account_id` equal to the Microsoft account being tested.
   - Confirm the worker no longer shows Redis/event-loop errors.
   - If Microsoft still returns `AADSTS90013`, the remaining action is to reconnect the Microsoft mailbox so a fresh refresh token is issued under the corrected flow.