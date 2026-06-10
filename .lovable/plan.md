## What the problem is

The Microsoft account connection is now working: the mailbox `hello@document-centre.com` is saved as an active `graph_oauth` email account.

The remaining failure is in the sending worker, not the OAuth setup. The live email sender is still running code that says `transport graph_oauth not yet implemented in pdf-server`, while the current repository already contains the `graph_oauth` credential loader and sender.

## Plan

1. **Confirm the running worker path**
   - Check whether outbound email is being processed by the VPS/Celery `worker-emails` service or the Cloud Run `worker-emails-http` service.
   - Confirm the deployed image/service is older than the current repo code.

2. **Verify required Microsoft OAuth runtime secrets**
   - Ensure the email worker runtime has the same Microsoft OAuth client ID and client secret used by the connect flow.
   - If those env vars are missing, add them to the worker environment before redeploy/restart.

3. **Deploy/restart the email worker with current code**
   - Rebuild/redeploy the pdf-server worker image or restart the VPS `worker-emails` service from the updated codebase.
   - The key current files already support this transport:
     - `pdf-server/app/email/credentials.py`
     - `pdf-server/app/email/graph_oauth_client.py`
     - `pdf-server/app/tasks/email_tasks.py`

4. **Recover the failed email**
   - Requeue the failed proforma invoice outbox row or resend the invoice from the UI.
   - Confirm the row moves from `failed` to `sent` and records provider `graph_oauth`.

5. **Add a guard to prevent this recurring**
   - Update the worker deployment checklist/docs so `MICROSOFT_OAUTH_CLIENT_ID` and `MICROSOFT_OAUTH_CLIENT_SECRET` are listed as required for Microsoft 365 sending.
   - Optionally add a startup/health diagnostic that reports which email transports the worker build supports.

## Expected result

After the worker is redeployed/restarted with the current pdf-server code and Microsoft OAuth env vars, invoices should send through `hello@document-centre.com` without the `graph_oauth not yet implemented` transport error.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>