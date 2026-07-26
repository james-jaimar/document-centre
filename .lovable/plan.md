
## Problem

Clicking **Retry failed** on the PostNet campaign returned a huge red error blob (URL-encoded UUIDs off-screen). Root cause is in `supabase/functions/send-branch-marketing-campaign/index.ts` retry path:

1. `handleRetry` collects all failed recipients (484), then calls
   `admin.from("branches").select(...).in("id", branchIds)`.
   With 484 UUIDs that URL is ~19 KB — over PostgREST/edge gateway limits — so the request fails and the error string (which includes the encoded URL) is what the UI is rendering.
2. Even if that succeeded, the follow-up per-recipient PATCHes (`platform_email_campaign_recipients` update `.eq("id", recipientId)` fired in parallel per chunk) create 484 individual HTTP calls, which is exactly what triggered the earlier "Rate limit exceeded" storm on the first send.

The initial send path avoids issue #1 (it loads branches for the tenant in one query and filters in memory), but shares issue #2.

## Fix

Edit only `supabase/functions/send-branch-marketing-campaign/index.ts`.

### 1. Retry: stop passing 484 UUIDs in a URL
In `handleRetry`, replace the `.in("id", branchIds)` branch lookup with the same strategy the initial send uses:
- Load all branches for `campaign.tenant_id` in one query (`select id, name, email, slug, url_slug, trading_name` where `tenant_id = ...`).
- Build a `Map<id, BranchRow>` and look each recipient up locally.
- If the branch list is still very large, page it with `.range()` — no `in()` on caller-supplied ID lists.

### 2. Collapse per-recipient PATCH fan-out
Replace the `Promise.all(chunk.map(row => admin.from(...).update(...).eq("id", row.id)))` patterns in `enqueuePrepared` (and the failed/missing update loops in `handleRetry`) with bulk writes:
- Use a single `admin.from("platform_email_campaign_recipients").upsert(rows, { onConflict: "id" })` per chunk, where each row carries `id`, `status`, `sent_at`, `error`, `action_link`.
- Keep the existing `INSERT_CHUNK = 500` batching.
- Keep `refreshCampaignCounts` at end-of-chunk (not per row).

This turns ~1000 PATCHes into ~2 upserts per 500-row chunk and removes any chance of gateway rate limiting on the internal writes.

### 3. Surface a friendlier error to the UI
In `handleRetry` (and top-level `serve` handler), when a Supabase error object is returned, respond with `{ error: <short message>, code }` — never echo the raw request URL back to the client. Frontend already renders `data.error` in a toast, so keeping it short prevents another off-screen blob if something else goes wrong later.

No frontend changes required; `PlatformCommunications.tsx` already handles the `queued: true` / `retry: true` responses and polls history.

## Verification

1. Deploy the edge function.
2. On the existing PostNet campaign (`833fa5aa-…`), click **Retry failed** — request should return `{ queued: true, retry: true, ... }` within a second.
3. Watch `platform_email_campaigns.sent_count` / `failed_count` climb via the auto-polling History tab.
4. Confirm `email_outbox` receives ~484 new `queued` rows and the Cloud Run worker drains them at its configured pace.
5. If any row fails at Microsoft/SMTP, it lands back in `platform_email_campaign_recipients.status = 'failed'` and can be retried again without hitting the URL-length wall.

## Out of scope

- No changes to the worker, Cloud Tasks rate limits, or Graph OAuth account.
- No change to tracking pixels or activation-link generation.
