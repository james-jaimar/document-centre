# Upload Pipeline Speed-Up

The 8pp A4 upload was slow for **three concrete, measurable reasons** confirmed in the edge logs:

| Cause | Wasted time per upload | Severity |
|---|---|---|
| `pollJob` fixed at 2.5s — short jobs (~200ms) wait the full interval before next check, across 4 sequential job polls | ~7–10s | **Highest** |
| `getDerivedFiles` polled every 3s, up to 60×, through the Deno proxy (~550ms each) | ~3–6s on small docs | High |
| `demo-bootstrap` 500 from a bad `ON CONFLICT` spec — fails 1s per Try-flow entry (not upload, but blocks the demo) | ~1s, plus a scary console error | Medium |

Edge logs confirm 30+ `pdf-api` round-trips per upload, each 230–975ms (median ~550ms), with constant Deno boot churn (`booted (time: 30-49ms)` repeated dozens of times).

---

## Fix 1 — Adaptive `pollJob` cadence

**File:** `src/lib/documentCentreApi.ts` — `pollJob`

Replace the fixed 2500ms interval with an adaptive ramp:
- Start at **300ms** (catches sub-second jobs immediately)
- Double each attempt up to a **2500ms** ceiling
- Keep the same `maxAttempts` budget (still 360 polls = ~15 min total)

Inspect, normalize, and print-ready jobs on small PDFs typically finish in 200–800ms, so this alone saves ~6–8s per upload with zero server impact.

```ts
// Pseudocode
let interval = 300;
for (let i = 0; i < maxAttempts; i++) {
  const job = await getJob(jobId);
  onUpdate?.(job);
  if (TERMINAL_STATUSES.has(job.status)) return job;
  await new Promise(r => setTimeout(r, interval));
  interval = Math.min(interval * 1.5, 2500);
}
```

## Fix 2 — Tighten `getDerivedFiles` polling in `renderDocumentThumbnails`

**File:** `src/hooks/useDocumentUpload.ts` — `renderDocumentThumbnails` (line 88–110)

The current loop sleeps **3000ms between checks for up to 60 polls**, even after the previews task has reported `completed`. Since `generate_previews` writes all files in one Ghostscript pass before the task ends, the files are usually already there when polling starts.

Changes:
- Do an **immediate first check** right after `pollJob` returns `completed` (no initial 3s wait).
- Adaptive cadence: 500ms → 1000ms → 2000ms (cap), instead of flat 3000ms.
- Reduce `MAX_THUMB_POLLS` from 60 → 30 (still ~45s upper bound with the new cadence).
- Keep the existing "stale poll" early-exit logic.

For an 8pp doc this turns ~9–18s of polling into ~1–3s.

## Fix 3 — Repair `demo-bootstrap` upsert

**Root cause** (from edge logs):
```
demo-bootstrap: membership upsert failed
code: "42P10"
message: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
```

The function does `onConflict: "profile_id,tenant_id,app_id"` but no matching unique index exists on `tenant_memberships`.

**File:** `supabase/functions/demo-bootstrap/index.ts`

Replace the brittle upsert with a **read-then-insert-if-missing** pattern (idempotent without needing a specific unique index):

```ts
const { data: existing } = await admin
  .from("tenant_memberships")
  .select("id")
  .eq("profile_id", user.id)
  .eq("tenant_id", tenant.id)
  .eq("app_id", tenant.app_id)
  .maybeSingle();

if (!existing) {
  const { error: insErr } = await admin
    .from("tenant_memberships")
    .insert({ profile_id: user.id, tenant_id: tenant.id, app_id: tenant.app_id, role: "customer", is_active: true });
  if (insErr) { /* return 500 */ }
}
```

This avoids needing a DB migration and stops the 500 + console error on every Try-flow entry.

## Out of scope (explicitly deferred)

- **Server-push (SSE/WebSocket) job completion signal** — would eliminate polling entirely but is a much larger change requiring backend Celery → Redis pub/sub → FastAPI SSE wiring. Worth doing later if the pipeline still feels slow after Fixes 1 & 2.
- **Postgres / Celery health-probe tuning** — the previous proposal you declined; not revisiting.
- **`pdf-api` Deno proxy keep-alive / connection pooling** — Deno edge runtime cycles instances aggressively; not much we can change there from our side.
- **Duplicate `crop_rasterize` dedup** — already resolved by the `generate_previews` switch in the previous round.

## Expected outcome for an 8pp A4 upload

| Phase | Before | After |
|---|---|---|
| Inspect job poll | ~2.5s | ~0.3–0.8s |
| Normalize job poll | ~2.5s | ~0.3–0.8s |
| Print-ready job poll | ~2.5s | ~0.3–0.8s |
| `generate_previews` job poll | ~2.5s | ~0.3–0.8s |
| Derived-files polling | ~6–9s | ~1–3s |
| Demo bootstrap | 1s + 500 error | ~150ms, no error |
| **Total perceived speedup** | — | **~12–18s faster** |

## Files to be edited

- `src/lib/documentCentreApi.ts` — adaptive `pollJob`
- `src/hooks/useDocumentUpload.ts` — tighter `renderDocumentThumbnails` polling
- `supabase/functions/demo-bootstrap/index.ts` — replace upsert with read-then-insert

No DB migration needed. No VPS changes needed. Approve to implement.
