# Reduce Supabase Disk IO Budget burn

## Diagnosis

Supabase is warning about Disk IO. The dominant cost is the `email-dispatcher` cron firing **every minute, every day** — 1,440 runs/day, 43,000+ since project start — even though the `email_outbox` is almost always empty. Each tick:

- writes a row into `cron.job_run_details` (now **7 MB / 10k rows**)
- writes a row into `net._http_response` (now **11 MB** — the **#1 largest table in the entire DB**)
- runs a stale-lock `UPDATE` and a `SELECT` against `email_outbox`
- spins up an edge function

Both `net._http_response` and `cron.job_run_details` grow unbounded — nothing currently prunes them.

Secondary issues:
- **Sequential scans** on `orders` (215k tuple-reads), `order_items` (596k tuple-reads), `documents` (144k tuple-reads) — likely missing filter indexes or unbounded `select()` calls.
- **Frontend polling** on Platform → Document Centre tabs at 5s intervals (Overview/system, queues, workers, jobs). If a tab is left open, that's ~12 PostgREST hits/minute per tab.

## Fixes

### 1. Slow down the email-dispatcher cron (biggest single win)

The outbox almost never has anything pending. Drop from **every minute → every 5 minutes** for normal traffic, and let the existing `next_attempt_at` backoff (1m → 5m → 15m → 1h → 6h) absorb retries naturally. For user-facing emails that need to feel instant (e.g. password reset), the existing `send-email` function path is already synchronous — only the queued/retry path uses the cron, so latency for those isn't affected.

Migration:
```sql
SELECT cron.unschedule('email-dispatcher-tick');
SELECT cron.schedule(
  'email-dispatcher-tick',
  '*/5 * * * *',  -- every 5 minutes
  $$ SELECT net.http_post(...) $$
);
```

Expected impact: ~80% reduction in cron-driven IO (288 runs/day vs 1,440).

### 2. Prune the unbounded system log tables

Add a daily cron that trims old rows. Both Supabase and pg_net officially support this:

```sql
-- Keep 24h of HTTP responses (currently growing forever)
SELECT cron.schedule(
  'prune-net-http-response',
  '15 3 * * *',
  $$ DELETE FROM net._http_response WHERE created < now() - interval '24 hours' $$
);

-- Keep 7 days of cron run history
SELECT cron.schedule(
  'prune-cron-run-details',
  '20 3 * * *',
  $$ DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days' $$
);
```

Then a one-shot `VACUUM` on those tables to reclaim the 18 MB.

### 3. Add missing indexes / fix seq scans

I'll inspect the worst offenders to confirm which queries are causing them, then add targeted indexes. Most likely candidates (to be confirmed by reading the actual queries):
- `order_items(order_id)` — 596k tuple reads is an index lookup pattern
- `orders(tenant_id, customer_status)` for the admin order lists
- `documents(order_id)` for the document panel

I'll only add an index if I can identify the specific query benefiting from it — no speculative indexing.

### 4. Gate frontend polling

The Document Centre platform pages refetch every 5s. Two cheap wins:
- Add `refetchIntervalInBackground: false` so polling pauses when the tab is hidden (it doesn't by default in TanStack Query v5).
- Bump the most aggressive ones from 5s → 15s (system, queues, workers). These are ops dashboards — 15s is plenty.

### 5. Optional: tighten the dispatcher itself

Two micro-optimisations inside `email-dispatcher/index.ts`:
- Skip the stale-lock `UPDATE` if there are no `sending` rows (cheap `SELECT count(*) WHERE status='sending'` first, or use a `WHERE EXISTS` guard).
- Early-return before claiming if the `SELECT due` returns empty (it already does this, but the stale-lock UPDATE runs unconditionally above it).

## Files / objects touched

- **DB migration**: reschedule `email-dispatcher-tick`, add `prune-net-http-response` + `prune-cron-run-details` cron jobs, run one-shot VACUUM, add any confirmed indexes.
- `supabase/functions/email-dispatcher/index.ts` — guard stale-lock UPDATE.
- `src/pages/platform/PlatformDocumentCentreOverview.tsx`, `PlatformDocumentCentreQueues.tsx`, `PlatformDocumentCentreWorkers.tsx`, `PlatformDocumentCentreJobs.tsx`, `PlatformDocumentCentreStorage.tsx`, `PlatformDocumentCentreMetrics.tsx`, `PlatformDocumentCentreAudit.tsx`, `PlatformDemoActivity.tsx`, `components/platform/DocumentCentreLayout.tsx` — add `refetchIntervalInBackground: false`, lengthen aggressive intervals.

## Expected outcome

- Cron-driven writes: **−80%**
- `net._http_response` table: **11 MB → ~500 KB** steady-state
- `cron.job_run_details`: **7 MB → ~2 MB** steady-state
- IO-wait on idle should drop noticeably; the project should fall well back inside its Disk IO Budget.

Nothing in this plan changes user-facing behaviour — emails still send, dashboards still update, just less wastefully.
