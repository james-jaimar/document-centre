## Plan

### 1. Replace vague 403 guidance with an in-app Graph permission diagnostic
- Extend the platform Graph configuration function so it can run a real Microsoft Graph probe, not just “can I get a token”.
- The probe will call Microsoft Graph using the app-only token against `hello@document-centre.com` and classify the result:
  - credentials/token failure,
  - missing Graph Application `Mail.Send` / admin consent,
  - Exchange application access/RBAC denial,
  - mailbox not found or not a real Exchange mailbox,
  - successful access/send acceptance.
- Store the diagnostic on the platform email account so the UI shows the exact Microsoft-side failure, not generic advice.

### 2. Fix the platform test-send workflow
- Update the platform email settings “Send test” flow so it refreshes the platform account status after the worker fails or succeeds.
- Show a clear state distinction:
  - “token works, send blocked by Microsoft permissions”
  - “test queued, waiting for worker”
  - “sent”
  - “failed with Microsoft diagnostic”.

### 3. Correct the app-only Graph request body if needed
- Keep the worker using `POST /users/{hello@document-centre.com}/sendMail` for app-only sending.
- Remove avoidable ambiguity from the Graph payload by not trying to force a `from` header; app-only `/users/{sender}/sendMail` already determines the sender from the URL. This avoids Microsoft rejecting a message because of a mismatched or unsupported `from` field.
- Keep `replyTo`, recipients, subject, HTML/text body, attachments, and `saveToSentItems: true`.

### 4. Fix platform Sent Mail audit column issues
- The live `email_outbox` table uses `queued_at` and `error_message`, not `created_at` / `last_error`.
- Update platform Sent Mail queries and retry logic to use the actual columns consistently.
- Keep platform scope as `tenant_id is null`, so platform subscription/admin mail stays separate from tenant mail.

### 5. Clean up confusing legacy mailbox visibility
- Make tenant delegated Microsoft OAuth (`graph_oauth`) visibly separate from the platform app-only mailbox.
- Do not let a tenant OAuth row appear as a platform fix path.
- The Document Centre Demo delegated OAuth failure can remain a separate tenant mailbox issue after platform mail is working.

### Validation
- Query the platform account and latest outbox rows to confirm the platform row is the only active platform default.
- Deploy the updated platform Graph function.
- Run the new diagnostic against the real `hello@document-centre.com` account.
- Queue one platform test email and verify the resulting Sent Mail row shows either `sent` or a precise Microsoft diagnostic.

## Expected remaining external action
If the diagnostic still returns Microsoft `403 ErrorAccessDenied`, the code path is doing the standard app-only Graph flow correctly and the remaining fix is in Microsoft 365: Graph **Application** `Mail.Send` with admin consent, and/or Exchange Application RBAC allowing this app to send as `hello@document-centre.com`. The new diagnostic will make that explicit instead of leaving us guessing.