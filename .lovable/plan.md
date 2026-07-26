## Goal

Track whether Postnet (and other) recipients actually open the marketing/activation blast, without touching the visible `<a href>` links (which stay clean, direct URLs — so branded activation links remain the primary success metric).

## Current state (verified)

- `supabase/functions/_shared/emailTracking.ts` already exposes `appendTrackingPixel`, `rewriteLinksForTracking`, and `injectTracking`, signed with `EMAIL_TRACKING_HMAC_SECRET`.
- The public `email-track` edge function already logs opens/clicks into `email_tracking_events` and rolls up `open_count` / `first_opened_at` / `click_count` on `platform_email_campaign_recipients`.
- Welcome campaign (`send-branch-welcome-campaign`) and trigger dispatcher already inject full tracking.
- `send-branch-marketing-campaign/index.ts` (lines 208-244) **explicitly skips tracking** with `const trackedHtml = html;`. That's the only reason marketing sends have no open data.
- No Amplify rewrite exists for `/email-track` on the tenant custom domain, so pixel URLs will resolve to the raw Supabase functions host. That's acceptable for an invisible 1×1 GIF (recipient never sees the URL unless they view source), and is the same host already used by the welcome campaign.

## Change

1. **`send-branch-marketing-campaign/index.ts`**
   - Import `appendTrackingPixel` from `../_shared/emailTracking.ts`.
   - Replace `const trackedHtml = html;` with `const trackedHtml = await appendTrackingPixel(html, campaignId, rcpt.id, null);`.
   - Keep the deliberate decision to **not** rewrite `<a href>` links — activation links stay as clean `https://<tenant>/activate/<slug>` URLs.
   - Update the block comment above to reflect: "Inject 1×1 open pixel only; leave `<a href>` untouched so activation URLs remain branded."

2. **Platform Communications UI (`src/pages/platform/PlatformCommunications.tsx`)** — where the marketing recipient list is shown, surface the open data that will now start populating:
   - Add an "Opened" column / badge next to each recipient row driven by `open_count > 0` and `first_opened_at`.
   - Add a small campaign-level summary chip (e.g. `Opened 4 / 12`).
   - No new queries needed if the recipients list already selects `*`; otherwise add `open_count, first_opened_at` to the select.

3. **Secret check** — `EMAIL_TRACKING_HMAC_SECRET` is already required by the welcome campaign path, so nothing to add. If it were ever missing, `signTrackingToken` throws and the send would fail; the plan assumes it's set (welcome campaign already depends on it).

## Out of scope

- Click tracking on marketing emails (would replace visible URLs with `functions.supabase.co/email-track?...`, defeating the "clean branded link" goal).
- Amplify/tenant rewrite for `/email-track` — nice-to-have follow-up if we want the pixel host to also read as the tenant domain; not required for opens to work.
- Per-campaign toggle for tracking — can add later if a customer objects; opens are industry-standard and unobtrusive.

## Caveats to flag to the user

- Open tracking is inherently approximate: Apple Mail Privacy Protection pre-fetches images, which inflates opens; Gmail proxies images, which is fine but hides IPs; plain-text-only clients never trigger it. Treat the number as "at least this many were opened / previewed."
