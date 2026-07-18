## Configurable system email nudges

Add a platform-controlled nudge scheduler that sends branch lifecycle emails on a cadence platform admins can toggle and time — no hard-coded schedules.

### Scope (v1 nudge types)

1. **Trial expiring** — 7d, 3d, 1d before `trial_ends_at`
2. **Trial expired** — on/after expiry, until subscribed
3. **Payment failed / grace period** — while `past_due` with `grace_until` set (e.g. 3d, 1d before grace end)
4. **Subscription cancelled** — once, when state flips to `cancelled`/`force_cancel`
5. **Onboarding stalled** — branch activated but required checklist steps incomplete after N days (e.g. 3d, 7d)

### Settings — platform-only

New table `platform_nudge_settings` (single-row config, keyed by `nudge_key`):

| Column | Purpose |
|---|---|
| `nudge_key` (pk) | e.g. `trial_expiring`, `trial_expired`, `payment_past_due`, `subscription_cancelled`, `onboarding_stalled` |
| `enabled` | master on/off |
| `offsets_days` | int[] — days before/after the anchor event (e.g. `{7,3,1}`, or `{3,7}` for stalled) |
| `min_hours_between_sends` | dedupe guard, default 20h |
| `updated_at`, `updated_by` | audit |

New platform admin page **Platform → Communications → Nudges**: one row per nudge with a toggle and comma-separated offset editor. No template editing in v1 (copy stays in code, per your choice).

### Recipients

Branch owner/admin members only — resolve via `tenant_memberships` filtered to the branch's tenant with roles `Owner`/`Admin`, joined to `profiles.email`.

### Delivery + dedupe

- New table `nudge_send_log(branch_id, nudge_key, offset_day, recipient_email, sent_at)` with unique `(branch_id, nudge_key, offset_day, recipient_email)` to guarantee each nudge fires once per recipient per offset.
- Sends go through the existing `send-email` edge function (custom SMTP, branded — no Supabase auth path).

### Scheduler

- New edge function `nudge-dispatcher` — for each enabled nudge, query candidate branches, compute due offsets from anchor timestamp (`trial_ends_at`, `grace_until`, `cancelled_at`, `activated_at`), skip rows already in `nudge_send_log`, then enqueue emails.
- Wire via `pg_cron` + `pg_net`, hourly.

### Files

**New**
- `supabase/migrations/<ts>_platform_nudge_settings.sql` — 2 tables + grants + RLS (platform admin write, service_role full) + seed rows for the 5 nudge keys + cron job.
- `supabase/functions/nudge-dispatcher/index.ts` — scheduler.
- `supabase/functions/_shared/nudge-templates.ts` — subject/body per `nudge_key` with `{branch_name}`, `{days_left}`, `{portal_url}` substitutions.
- `src/pages/platform/PlatformNudgeSettings.tsx` — admin UI.
- `src/hooks/usePlatformNudgeSettings.ts`.

**Edited**
- `src/App.tsx` — route for the new platform page.
- `src/components/platform/PlatformNav.tsx` (or equivalent) — nav entry under Communications.

### Out of scope (v1)

- Template editing UI (copy lives in `nudge-templates.ts`).
- Tenant/branch overrides.
- Non-lifecycle nudges (marketing, product tips).
- Backfill of already-missed nudges — dispatcher only fires forward from deploy time.

### Verification

- Typecheck.
- Manually trigger `nudge-dispatcher` via `supabase--curl_edge_functions` against `Demo3new` with a manipulated `trial_ends_at` to confirm one send + dedupe on re-run.
