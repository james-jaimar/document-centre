
## Goal

From the Platform Communications history view, let an admin take any past campaign and dispatch a follow-up to only the recipients who haven't registered an open — with a fresh subject line, safety filters, and full tracking on the new send.

## What ships

### 1. Campaign detail drawer / page (Platform → Communications → History)

Clicking a past campaign row opens a detail view showing:

- Send summary: sent / failed / suppressed / bounced counts
- **Engagement**: opened (unique), open rate, clicked (unique), click rate, last activity timestamp
- Recipient table with filter chips: `All · Opened · Not opened · Clicked · Bounced/failed`
- A "How opens are measured" tooltip explaining the pixel caveats above (Outlook image-blocking under-counts, Apple MPP over-counts) so the numbers are read correctly.

### 2. "Resend to unopened" action

Primary CTA on the detail view. Opens a dialog that:

- Shows the target audience count, computed live as:
  `sent_at IS NOT NULL AND first_opened_at IS NULL AND status = 'sent' AND email NOT IN suppressions AND recipient not already in a follow-up for this campaign in the last N days`
- Lets the admin tweak subject (pre-filled with e.g. `"Re: " + original subject`), preheader, and optionally swap the template (defaults to the original campaign's template).
- Optional delay: send now, or schedule for a specific time.
- Shows the exclusions: `X suppressed, Y bounced, Z already followed-up` so it's transparent why the audience count is smaller than "514 − 104".
- On confirm, creates a **new** `platform_email_campaigns` row (kind: `follow_up`, `parent_campaign_id` = original) and enqueues one `platform_email_campaign_recipients` row per target, then dispatches via the same outbox path as the original blast (the one we hardened for the 514-send).

### 3. Tracking the follow-up

- New campaign gets its own pixel + click tokens, so we can measure whether the resend actually lifted engagement.
- On the original campaign's detail view, show a small "Follow-ups" section listing child campaigns with their own open/click rates, so you can see e.g. "Original: 20% opens → Resend to unopens: +7% additional reach".
- Bump `follow_up_count` / `last_follow_up_at` on the original recipient rows so the same person isn't hit twice by successive resends.

### 4. Guardrails

- Hard block on resending to a recipient in `email_suppressions` or with a hard-bounce `last_error_code`.
- Soft warn if the original send was <24h ago ("recipients may still open — consider waiting").
- Cap resends per recipient per campaign (default 1, admin-overridable up to 2).
- Reuse the same tenant-scoped `email_accounts` selection as the original campaign so sending identity stays consistent.

## Technical notes

- Data already exists: `platform_email_campaigns`, `platform_email_campaign_recipients` (has `first_opened_at`, `open_count`, `follow_up_count`, `last_follow_up_at`), `email_tracking_events`, `email_suppressions`, `email_outbox`.
- New columns on `platform_email_campaigns`: `parent_campaign_id uuid null references platform_email_campaigns(id)`, `kind text default 'blast'` (`'blast' | 'follow_up'`).
- New edge function `create-campaign-followup` (or extend `send-branch-marketing-campaign`) that: validates admin auth, computes audience via SQL (server-side, not client), inserts campaign + recipient rows, enqueues into `email_outbox` in the same batched way that fixed the 514-send.
- Frontend: extend `PlatformCommunications.tsx` with the detail drawer + resend dialog; add a `useCampaignEngagement` hook that aggregates opens/clicks/bounces per campaign.
- Existing `process-campaign-triggers` edge function already has a `not_opened` condition — we can either reuse that machinery (create a one-shot trigger with `max_follow_ups=1`) or do an explicit dispatch. Recommend explicit dispatch for the manual "send now" UX; keep the trigger system for automated drip campaigns.

## Out of scope for this pass

- A/B subject testing on the resend (can be a follow-up).
- Automated recurring resends (the trigger system already handles that if you want it).
- Click-based segmentation ("resend to opened-but-didn't-click") — trivial to add later once the "resend to unopened" plumbing is in.
