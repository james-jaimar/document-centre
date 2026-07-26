## What I found

This specific failure is **not showing as a Microsoft/Outlook send failure** and **not showing as the GCP email worker failing**.

Evidence checked:
- Campaign `833fa5aa-8268-4163-ac72-538702d9e2ba`, created `2026-07-26 18:37:03`, has `514` recipients: `30` marked sent and `484` marked failed.
- The failed recipient rows all contain the same kind of error: `Rate limit exceeded for trace 019f9f... Retry after ...ms`.
- The `email_outbox` queue only has successfully queued/sent branch-marketing rows around that time; the 484 failures did **not** become outbox send failures.
- `send-email` Edge Function logs show lots of boots/shutdowns around the send window, but no application-level Microsoft/Graph error.
- Current code calls the `send-email` Edge Function once per recipient from inside `send-branch-marketing-campaign`, with parallel dispatch. That means a 514-recipient campaign creates hundreds of internal Edge Function invocations in a burst.

So the practical cause is: **our campaign Edge Function is fan-out calling another Edge Function too aggressively and hitting an Edge/Supabase gateway invocation throttle before most emails reach the durable outbox queue.**

## Fix plan

1. **Stop fan-out calling `send-email` for campaigns**
   - Refactor `send-branch-marketing-campaign` so it no longer performs 514 HTTP calls to `/functions/v1/send-email`.
   - Instead, it will render each recipient email and insert rows directly into `public.email_outbox` in database chunks.
   - This makes campaign creation a durable queueing operation, not a burst of Edge Function invocations.

2. **Use one platform sender resolution per campaign**
   - Resolve the active platform email account once at the start.
   - Use that `email_account_id` on every queued marketing email.
   - If no platform sender exists, fail the campaign clearly before creating hundreds of failed recipient rows.

3. **Queue in safe chunks**
   - Insert outbox rows in controlled chunks, e.g. 50 at a time.
   - Update `platform_email_campaign_recipients` as `queued`/`sent` only after the corresponding outbox row is created.
   - Keep the existing tracking pixel and activation link per recipient.

4. **Kick the Cloud Run email worker once, not hundreds of times**
   - After queueing a batch/campaign, call the email worker notification once.
   - The Python worker/Cloud Tasks pipeline then drains `email_outbox` normally.

5. **Make Microsoft throttling safer if it happens later**
   - Keep provider-level Microsoft Graph 429 handling in the worker as retryable.
   - Apply the configured sender pacing more strictly: the active platform account currently has `send_delay_ms = 1500` and Graph OAuth transport, but the worker path should explicitly respect the configured delay/concurrency instead of relying on campaign Edge Function pacing.

6. **Repair/retry this campaign safely**
   - Do not resend the 30 already-sent recipients.
   - After the code fix, add a safe retry path for campaign `833fa5aa-8268-4163-ac72-538702d9e2ba` that queues only the 484 failed recipients whose error starts with `Rate limit exceeded for trace`.
   - Update the campaign counts after retry queueing so the UI reflects the corrected state.

## Expected result

A 500+ recipient campaign should return quickly as queued, create durable `email_outbox` rows without Edge Function rate-limit failures, and let the existing email worker send through Outlook at a controlled pace.