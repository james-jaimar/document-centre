## What I confirmed

- The code at commit `d618700` does include `graph_oauth` support in the Python pdf-server.
- The live `pdf-api /health` endpoint now reports `email.supported` includes `graph_oauth`, so the GitHub deploy did update at least the API image.
- The latest failed row for `INV-00076` was queued at `18:29:31` and still failed with the old exact message: `transport graph_oauth not yet implemented in pdf-server`.
- That exact error string is not present anywhere in the current repository, so it is coming from a stale deployed runtime path or a stale running revision, not from current source.
- One requeued `INV-00082` row did send successfully at `18:20:55`, which proves the Microsoft OAuth account/token itself works.

## Plan

1. **Add worker-specific deployment verification**
   - Extend the GitHub deploy workflow’s post-deploy check to validate `pdf-worker-emails`, not just `pdf-worker-light`.
   - Require the live email worker revision to have:
     - `ROLE=worker-emails-http`
     - `QUEUE_BACKEND=cloud_tasks`
     - `MICROSOFT_OAUTH_CLIENT_ID` mounted
     - `MICROSOFT_OAUTH_CLIENT_SECRET` mounted
   - Include the live `pdf-worker-emails` revision/image in the workflow summary so stale worker traffic is visible after every deploy.

2. **Expose the email worker health safely**
   - Add a small internal health/diagnostic endpoint for the email worker, protected the same way as the worker task endpoints.
   - It should return non-secret facts only: role, revision, queue backend, supported transports, and whether Microsoft OAuth env vars are present.
   - This gives us a direct proof of what the live email worker is running, instead of inferring from the API service.

3. **Add a runtime guard against the stale path**
   - In the current Python send path, add a clear startup/runtime log line when `graph_oauth` is supported.
   - If an unknown transport occurs, include the revision/role in the error message so future rows identify the exact service revision that produced the failure.

4. **Recover the latest failed invoice after verification**
   - Once the diagnostics show the email worker is on the current revision, requeue `6ceab9ad-7695-43c4-92fe-6573a881c4ab` for `INV-00076`.
   - Confirm it changes to `sent` rather than just queued.

## Expected result

After this, we’ll know whether `pdf-worker-emails` is actually serving the latest revision, and future GitHub deploys will fail loudly if the email worker is left on stale code or missing Microsoft OAuth secrets.