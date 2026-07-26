## What went wrong

No `platform_email_campaigns` row exists for the 514-branch attempt (largest recent campaign was `total_recipients=1`), so the function failed **before** the campaign insert on line 128 of `send-branch-marketing-campaign/index.ts` — it never even started dispatching. The most likely cause (unconfirmed — I have no captured error text; edge logs for this function are empty) is the branches lookup at line 80:

```ts
admin.from("branches").select(...).eq("tenant_id", tenant_id).in("id", branch_ids)
```

PostgREST turns `.in()` into a URL query string. 514 UUIDs = ~19 KB in the URL, which trips the PostgREST/proxy URL length limit and comes back as an error before anything else runs.

Even if we fix that, the current shape has a second, bigger problem: **everything runs sequentially inside one request**. For each of 514 branches we do 2–3 DB calls + a `fetch` to `send-email` + more DB updates. That easily exceeds the edge function wall-clock limit, and the client sees a network error mid-run.

Step 1 of the plan verifies the URL-length theory (or replaces it with the real cause) before we change the transport shape.

## Plan

### 1. Confirm the immediate error

- Re-run the campaign against a small subset (say 20 branches) to make sure the current code path is healthy at small scale.
- Re-run against the full 514 with light instrumentation (`console.log` around the branches lookup + campaign insert) and read logs via `supabase--edge_function_logs`. Only then commit to a root cause.

### 2. Fix the branches lookup so it survives 500+ IDs

Regardless of which query blew up, `.in("id", branch_ids)` with 500+ UUIDs is unsafe. Replace it with either:

- a chunked lookup (200 IDs per call, merged), **or**
- a single `select("id, name, email, slug, url_slug, trading_name").eq("tenant_id", tenant_id)` and filter to the requested set in memory (tenant has ~517 branches — one round trip, no URL pressure).

The in-memory filter is simpler and matches the "we already have the full branch list on the client" reality.

### 3. Move the send loop off the request thread

Rework `send-branch-marketing-campaign` to return quickly and dispatch in the background:

1. Resolve template + tenant + branches + platform sender (fast).
2. Insert the `platform_email_campaigns` row.
3. **Bulk-insert all recipient rows as `status='pending'`** in a single call (chunked at ~500 per insert if needed) — no per-branch round-trips up front.
4. Kick off dispatch with `EdgeRuntime.waitUntil(dispatch(campaignId))` and immediately return `{ campaign_id, total_recipients }` to the caller.
5. Inside `dispatch`, iterate pending recipients in **small parallel batches** (e.g. `Promise.all` over 10 at a time) — each batch mints/refreshes the activation page, renders HTML, appends the tracking pixel, and calls `send-email` (which just enqueues to `email_outbox` — the real SMTP send happens in the Python worker, so this is cheap).
6. After each batch, update `platform_email_campaigns.sent_count / failed_count`. Mark campaign `completed` (or `partial`) at the end.

`send-email` already enqueues rather than sending inline, so all we need the edge function to do is create outbox rows. That's fast enough to finish 500+ within the background budget.

### 4. Client UX

- The composer (`PlatformCommunications` / marketing campaign modal) currently awaits the full response. Change it to:
  - accept the immediate `{ campaign_id, total_recipients }` response,
  - show a toast "Queued 514 recipients — sending in the background",
  - subscribe to / poll `platform_email_campaigns` + `platform_email_campaign_recipients` for progress (the existing campaign card UI already reads these).

### 5. SMTP-side note (no code change needed)

The Microsoft Graph transport in `pdf-server/app/email/graph_oauth_client.py` sends one message per API call. The Python worker's concurrency is capped per-account by `account_slot(...)` (see `email_tasks.py`), so even if we enqueue 514 rows at once the worker will pace them correctly. No throttling logic needs to live in the edge function.

## Technical notes

- Files to change:
  - `supabase/functions/send-branch-marketing-campaign/index.ts` — lookup fix, bulk recipient insert, `EdgeRuntime.waitUntil` background dispatch, batched parallelism.
  - Frontend composer (likely `src/pages/platform/PlatformCommunications.tsx` or its child modal — will confirm in build mode) — treat response as "queued", switch to progress polling.
- No schema changes. Existing `platform_email_campaign_recipients` columns (`status`, `sent_at`, `error`, `action_link`) already model per-recipient state.
- Keep `dry_run` behavior synchronous (it's bounded and admins want the results inline).
- Preserve current per-branch idempotency (reuse existing `platform_branch_activation_pages.slug`).
