## Why nothing sent

For tenant **Document Centre Demo** there are two M365 accounts:

| Account | Transport | Default? |
|---|---|---|
| `Document Centre (M365 Graph)` | `graph` (old client-credentials) | **yes** |
| `Microsoft 365` (`hello@document-centre.com`) | `graph_oauth` (new sign-in) | no |

When you fired the order/quote email, the dispatcher resolved the **default** account — the old `graph` one — and it failed silently (no row even reached the outbox for the demo tenant today; the old account's secrets aren't set up). The new OAuth account is connected fine, it's just not the one being picked.

On top of that, the edge fallback dispatcher (`email-dispatcher`) doesn't know about `graph_oauth` yet — only the Cloud Run Python worker does — and the UI has no Test button for OAuth accounts, so there's no way to prove a send end-to-end from the panel.

## Fix

1. **Promote the new OAuth account to default and deactivate the old graph account** for tenant `72347b5f` (Document Centre Demo). Data change only.
2. **Add a "Default" toggle and visible status to the Microsoft 365 / Outlook card** in `EmailAccountsTab.tsx` and `BranchEmailAccountsPanel.tsx` so you can pick which OAuth account is the default without SQL. Mirror the SMTP table's UX.
3. **Add a "Send test" button to the OAuth cards** (Gmail + Microsoft). New action `test_send_oauth` in `email-account-manage` that:
   - For `graph_oauth`: refreshes the access token via the stored refresh token (using `MICROSOFT_OAUTH_CLIENT_ID` / `_SECRET`) and POSTs `/me/sendMail` against Microsoft Graph.
   - For `gmail_oauth`: refreshes and POSTs `users.messages.send`.
   - Updates `last_verified_at` / `last_error` on the account.
4. **Add `graph_oauth` support to the edge `email-dispatcher`** as a fallback path (token refresh + Graph `sendMail`) so a row can still flush even if Cloud Run is down. Same logic as the worker's `graph_oauth_client.py`, ported to Deno.
5. **Verify**: after deploy, click "Send test" on the M365 card → confirm a row lands in `Sent Mail` with status `sent` and the mail actually arrives at the recipient.

## Out of scope

- No changes to the OAuth connect flow itself (that's already working — the account is connected and the refresh token is stored).
- No template/content changes.

## Technical notes

- Microsoft Graph token endpoint: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` with `grant_type=refresh_token`, `scope=https://graph.microsoft.com/.default offline_access Mail.Send`.
- Send call: `POST https://graph.microsoft.com/v1.0/users/{oauth_email}/sendMail` with `{ message: { subject, body, toRecipients, ... }, saveToSentItems: true }`.
- Promote-default migration runs in a single transaction and respects the existing per-(tenant,branch) single-default invariant already enforced by `email-account-manage`.
- Default state update for OAuth uses the same `upsert` path; just exposes `is_default` in the OAuth card.
