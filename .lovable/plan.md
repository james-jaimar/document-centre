# Communications CMS — Authoring + Tracking + Triggers

Three additions to the Platform Communications CMS so you can manage templates yourself and see what recipients actually do.

## 1. Manual template management (CRUD)

Today the Templates tab can only edit existing rows that I inserted. We'll add:

- **"New template"** button in the templates sidebar → modal asking for: Name, Slug (auto-generated from name, editable), Kind (`activation` or `marketing`), Description. Creates a stub row in `platform_email_templates` you can then edit.
- **Duplicate** action on each template (handy for A/B copies — e.g. `marketing_branch_offer_v2`).
- **Delete** action — only allowed when `is_system = false`. System templates (the two I seeded) stay protected so the send functions can't break.
- **Slug uniqueness** check before save with a clear error.
- Kind switcher locked after creation (changing kind would break the token list and sender wiring).

## 2. Open + click tracking

A lightweight tracker, no third-party service:

- New table `email_tracking_events` (event_type: `open` | `click`, campaign_id, recipient_id, url, ip_hash, user_agent, created_at).
- New **public** edge function `email-track` with two routes:
  - `GET /email-track/open/:token.gif` → returns a 1×1 transparent GIF and logs an `open` event.
  - `GET /email-track/click/:token?u=<encoded-url>` → logs a `click` event then 302-redirects to the original URL.
- Token is an opaque per-recipient HMAC so opens/clicks tie back to the exact `platform_email_campaign_recipients` row without exposing IDs.
- `send-branch-marketing-campaign` and `send-branch-welcome-campaign` will:
  - Append a tracking pixel `<img>` to the rendered HTML (skipped for plain-text fallback).
  - Rewrite outgoing links (the activation/welcome link plus any link in the body) through `/email-track/click/...`.
- Aggregate counters on `platform_email_campaign_recipients`: `first_opened_at`, `open_count`, `first_clicked_at`, `click_count`, `last_clicked_url`. Updated by the tracking function via service-role.
- Privacy: IPs are hashed with a daily salt (same pattern already used in `request-activation-email`). No raw IPs stored.

### Visibility in the CMS

In the **History** tab, each campaign row gets a small stats strip: Sent / Delivered / Opened / Clicked / Activated (activation flows) or Requested-activation (marketing). Expand a campaign to see the per-recipient table with open/click timestamps and the last URL clicked.

## 3. Follow-up triggers

A simple admin-configurable rule engine — not a full marketing automation:

- New table `platform_campaign_triggers`: campaign_id (or template_slug for "applies to all future campaigns"), condition (`not_opened` | `not_clicked` | `not_activated`), delay (e.g. 3 days), action_template_slug (which template to send as the follow-up), enabled.
- New edge function `process-campaign-triggers` run on a 30-minute pg_cron schedule. It scans recipients matching each enabled trigger's condition + delay window and enqueues a follow-up send (reusing the same activation/marketing send pipeline so tokens stay valid).
- UI: a **Triggers** sub-tab inside the campaign detail view. Add/edit/disable triggers, see how many recipients each trigger has already actioned.
- Safety: hard cap of 2 follow-ups per recipient per campaign and a global "do not contact" check against `email_suppressions`.

## Out of scope (flag for later)

- Bounce/complaint webhooks beyond what `email_send_log` already records.
- A/B testing harness.
- Scheduled send (send-at date). Triggers cover most of the "if they haven't by X" need.

## Technical notes

**New tables**
- `email_tracking_events` (RLS: platform_admin read; service_role write).
- `platform_campaign_triggers` (RLS: platform_admin full; service_role full).
- Columns added to `platform_email_campaign_recipients`: `first_opened_at`, `open_count`, `first_clicked_at`, `click_count`, `last_clicked_url`.

**New edge functions**
- `email-track` (public, no JWT) — pixel + click redirect.
- `process-campaign-triggers` (cron) — follow-up scheduler.

**Modified**
- `supabase/functions/_shared/sendBranchActivation.ts` and both campaign senders → inject pixel, rewrite links.
- `src/pages/platform/PlatformCommunications.tsx`:
  - Templates tab: New / Duplicate / Delete + create modal.
  - History tab: stats strip + expandable per-recipient detail.
  - New Triggers panel inside campaign detail.

**Secrets**
- `EMAIL_TRACKING_HMAC_SECRET` (auto-generated) used to sign tracking tokens.

Approve and I'll build it end-to-end.
