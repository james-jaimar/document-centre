// Kick the Cloud Run email worker to dispatch the just-enqueued row(s).
//
// Replaces the legacy fire-and-forget POST to the `email-dispatcher` edge
// function. The Python worker exposes a webhook-token-protected endpoint at
// `/internal/email/notify` that enqueues a single `scan_outbox` task via
// Cloud Tasks. Idempotent: bursts collapse because `claim_email_batch()`
// uses FOR UPDATE SKIP LOCKED.
//
// Safe to call without awaiting. If env vars are missing this is a no-op —
// the Cloud Scheduler `email-scan-outbox-30s` job still picks the row up
// within 30s.
export function kickEmailWorker(): void {
  const base = (Deno.env.get("DOCUMENT_CENTRE_API_URL") ?? "").replace(/\/+$/, "");
  const token = Deno.env.get("EMAIL_NOTIFY_TOKEN") ?? "";
  if (!base || !token) return;
  fetch(`${base}/internal/email/notify`, {
    method: "POST",
    headers: {
      "X-Webhook-Token": token,
      "Content-Type": "application/json",
    },
    body: "{}",
  }).catch(() => {});
}
