
## Goal

Split the current single "welcome + reset password" email into a **two-prong onboarding flow**:

1. **Prong 1 — Marketing email** (bulk-sendable, no credentials, no auth token). Branded "Document Centre", pitches the offer, and links to a per-branch **Activation page** where the recipient requests their own sign-in email.
2. **Prong 2 — Activation email** (transactional, one recipient, triggered by the recipient themselves). Carries the reusable `/welcome?token=…` magic-link bridge we already built and lands them in the password-set / sign-in flow.

This keeps marketing reach separated from credential delivery (better deliverability, no leaked links forwarded around the branch), while still using all the onboarding token plumbing already in place.

## What changes

### 1. New table `platform_branch_activation_pages`

One row per branch we want to be able to onboard. Columns:

- `id`, `tenant_id`, `branch_id` (unique), `app_id`
- `slug` — short opaque url-safe token used in the marketing link (`/activate/<slug>`); decoupled from branch slug so we can rotate without disrupting branch URLs
- `contact_email`, `contact_name` (snapshot at creation; can be overridden per-send)
- `is_active` (default true) — lets us disable a page without deleting
- `created_at`, `created_by`

RLS: service role + platform admin only. Public read happens through an edge function, never direct.

### 2. New edge function `get-activation-page` (public, no JWT)

Input: `{ slug }`. Returns the public-safe payload the activation landing page needs:

- `tenant_name`, `tenant_logo_url`, `branch_name`, `branch_city`
- `contact_name_masked` (e.g. "John D.") and `contact_email_masked` (e.g. "j••••@postnet.co.za") — so the visitor can confirm they're the right person without us leaking the full address to anyone who guesses a slug
- `is_active`, `already_completed` (true once the branch has an active manager who has signed in)

### 3. New edge function `request-activation-email` (public, no JWT, rate-limited)

Input: `{ slug, confirm_email }`. Behaviour:

- Looks up the activation page; 404 if missing/inactive
- **Confirm-email check**: `confirm_email` (typed by the user) must match the stored `contact_email` (case-insensitive). If it doesn't match, return a generic "we'll be in touch" response — never reveal the real address. This is the guardrail you asked for: marketing email goes to the listed contact, and only that contact can trigger the activation email.
- Rate limit: max 3 sends per slug per hour, max 1 per slug per 60 seconds (tracked in a small `platform_activation_requests` audit table with `slug`, `ip_hash`, `created_at`).
- On success: reuses the existing `send-branch-welcome-campaign` core logic (extracted into a shared helper `_shared/sendBranchActivation.ts`) to mint a `platform_onboarding_tokens` row and email the `/welcome?token=…` link via the existing branded transactional template.

### 4. New `platform_activation_requests` table (audit + rate-limit)

`id, slug, ip_hash (sha256 of ip + daily salt), email_confirmed (bool), result (enum: sent / mismatch / rate_limited / inactive / completed), created_at`. RLS: service role only. Used by `request-activation-email` for throttling and by the History tab for visibility.

### 5. CMS changes in `PlatformCommunications.tsx`

Add a third tab structure:

- **Marketing tab** (new): pick recipients (same picker as today), pick the marketing template, pick a "campaign name". On send:
  - For each recipient branch, upsert a `platform_branch_activation_pages` row (idempotent — reuse the existing slug if one already exists for that branch).
  - Send the marketing email via the existing `send-email` infrastructure. The email body merge field `{{activation_link}}` resolves to `https://<tenant_domain_or_app_origin>/activate/<slug>` (custom-domain aware via the same `resolveAppOriginDetailed` helper).
  - Record one row per recipient in `platform_email_campaigns` / `platform_email_campaign_recipients` with `kind = 'marketing'`.
- **Activation tab** (renamed from today's Compose): the existing direct-send-welcome flow. Kept for cases where we want to push the activation email ourselves without a marketing step (e.g. sales-call follow-up).
- **Templates tab**: gains a `kind` selector (`marketing` | `activation`). Seeds two new defaults:
  - `marketing_branch_offer` — Document Centre branded, pitches the offer, big CTA "Activate Your Branch" → `{{activation_link}}`.
  - `activation_branch_manager` — the existing branded welcome email, slightly reworded ("You requested this — here's your sign-in link").
- **History tab**: shows campaign `kind`, plus per-recipient counts from `platform_activation_requests` (requested N×, last requested at, sent at) joined with `platform_onboarding_tokens` (clicks, completed).

### 6. New public page `/activate/:slug` (`src/pages/Activate.tsx`)

Lightweight, branded with the tenant's logo + colours (looked up from `get-activation-page`). Content:

- "Activate your branch" heading with tenant + branch name
- A short "Confirm it's you" instruction explaining we'll email a sign-in link to the address on file
- Single input: "Confirm your email address" + Submit button
- Calls `request-activation-email`
- Success state: "Check your inbox — the link is valid for 1 hour and works as many times as you need until you've set your password"
- Mismatch / rate-limited / inactive / already-completed states with their own copy. Mismatch always shows the same generic "we'll get back to you" message to avoid email enumeration.

Route added in `App.tsx`, custom-domain aware (works at both `document-centre.com/activate/...` and `postnetprintcentre.com/activate/...`).

### 7. Shared helper `supabase/functions/_shared/sendBranchActivation.ts`

Extracts the "mint opaque token + render activation email + send via `send-email`" path out of `send-branch-welcome-campaign` so both that function and `request-activation-email` use it. No behavioural change to the existing direct-send flow.

### 8. Custom domain awareness

Both the marketing email's `{{activation_link}}` and the activation email's `/welcome?token=…` go through `resolveAppOriginDetailed` so PostNet emails land on `postnetprintcentre.com` and 3@1 emails land on their domain when configured, falling back to `/t/<slug>` on the platform domain.

## Technical notes

- Marketing send remains a server-side bulk loop; the credential-bearing activation email is **only ever** triggered by the recipient confirming their own email on the activation page. No bulk activation sends from the marketing tab.
- Confirm-email check is constant-time string compare; failure response is identical to success for timing-safe enumeration resistance, but we still record the real outcome in the audit table.
- Reusing `platform_onboarding_tokens` means the 1-hour / 20-uses / single-completion semantics already shipped apply verbatim.
- Activation pages do not expire. If a branch later changes contact, platform admin edits the row and the same slug keeps working with the new contact email.
- No changes to PayFast, subscriptions, billing, or Stripe paths.

## Out of scope

- DKIM/SPF tuning for the new marketing template (existing Document Centre sender domain already covers it).
- Drip / follow-up marketing sends — single-shot only for now.
- Migrating already-sent campaign history into the new `kind` column beyond defaulting old rows to `activation`.
