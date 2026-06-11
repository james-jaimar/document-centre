You’re right: this got over-engineered. The actual issue is that I split Microsoft mail into two competing paths:

```text
Tenant/branch mail:  standard delegated Microsoft OAuth connector -> graph_oauth -> /me/sendMail
Platform mail:       separate app-only Graph setup -> graph -> /users/{mailbox}/sendMail
```

That second platform-only path is the mess. It needs extra Application permissions / admin consent / Exchange RBAC and is why you’re seeing the `Mail.Send application role` red box. It is not the simple connector flow you expected.

Do I know what the issue is? Yes. The platform page was changed to prefer a new app-only Graph account instead of reusing the existing Microsoft OAuth connector with its own platform-scoped credentials.

## Plan

1. **Make Microsoft 365 one connector again**
   - Use the existing `microsoft-oauth-connect` OAuth flow for platform mail as well as tenant/branch mail.
   - Platform connection will be a normal `email_accounts` row with:
     ```text
     tenant_id = null
     branch_id = null
     transport = graph_oauth
     oauth_email = hello@document-centre.com
     own refresh token secret in Vault
     is_default = true
     ```
   - Tenant/branch connections remain separate rows with their own refresh tokens, even if the email address happens to be the same.

2. **Strip the platform email settings UI back to simple controls**
   - Remove the app-only wording, secret badges, “Re-provision”, “Diagnose Graph”, token-role panels, and Exchange RBAC instructions.
   - Replace them with the same simple pattern used in tenant settings:
     - “Sign in with Microsoft”
     - connected mailbox display
     - “Send test”
     - “Disconnect”
   - The platform button will call the existing connector with `scope: "platform"`.

3. **Stop platform mail from preferring the app-only account**
   - Update platform account resolution so platform-level emails use the platform default account, and the expected Microsoft path is `graph_oauth`.
   - Remove the special fallback that hunts for any `transport in (graph, graph_oauth)` outside the platform scope, because that can blur tenant/platform ownership.

4. **Remove the app-only Graph setup surface**
   - Remove the `platform-graph-configure` dependency from the frontend.
   - Leave low-level `transport='graph'` sender code only if still needed for existing legacy rows; otherwise remove the unused edge function from deployment.
   - The platform no longer asks for `MICROSOFT_GRAPH_TENANT_ID`, `MICROSOFT_GRAPH_CLIENT_ID`, or `MICROSOFT_GRAPH_CLIENT_SECRET` for sending platform mail.

5. **Fix Microsoft OAuth refresh consistency**
   - Keep the Microsoft OAuth connector on the documented delegated scopes:
     ```text
     offline_access
     https://graph.microsoft.com/Mail.Send
     https://graph.microsoft.com/User.Read
     ```
   - Ensure the worker refresh request uses the same fully-qualified Graph scopes, not a mixed shorthand scope string.
   - Send via `/me/sendMail`, with no forced `from` field.

6. **Clean up the visible state**
   - Platform Settings should show only the platform OAuth mailbox, not app-only diagnostics.
   - Sent Mail continues to show platform-level outbox rows where `tenant_id is null`.

7. **Validation**
   - Connect `hello@document-centre.com` from Platform Settings using Microsoft sign-in.
   - Send a platform test email.
   - Confirm the outbox row uses `provider = graph_oauth` and moves to sent, or shows only a normal OAuth refresh/send error if Microsoft rejects it.

## Result

After this, Microsoft mail is simple again:

```text
Each scope connects its own Microsoft account.
Each connected account stores its own refresh token.
Same email address is allowed because scope/row/credential are separate.
Sending uses the standard delegated Graph connector.
No app-only permissions, no Exchange RBAC, no token-role diagnostics.
```