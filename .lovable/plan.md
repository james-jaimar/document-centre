# Plan: Platform Onboarding CMS

## Goal
Give platform admins a single screen to send branded "Welcome to your store" emails to one or many branches, where each recipient gets their store URL, their username (branch email) and a one-time password-set link. First login forces a new password.

## What already exists (reuse, don't rebuild)
- `invite-member` Edge Function — creates the auth user (if needed), upserts the `branch_manager` membership, generates a Supabase recovery link, and sends a branded HTML email via `send-email`.
- `provision-branch-admins` Edge Function — bulk-creates `branch_manager` accounts for every branch in a tenant from `branches.email` (no email sent).
- `/reset-password` page (`ResetPassword.tsx`) — handles the recovery link, forces a new password before access.
- `send-email` + tenant branding (logo, primary colour, portal name) already wired into `invite-member`.

Net new code is mainly the CMS UI plus a small "campaign" Edge Function that loops branches and reuses the invite pipeline.

## What's new

### 1. Templates table (DB)
`platform_email_templates`:
- `id`, `slug` (e.g. `branch_welcome`), `name`, `subject`, `body_html`, `body_text`, `is_system`, timestamps.
- Seed one template: **Branch Welcome** with merge tokens `{{branch_name}}`, `{{contact_name}}`, `{{store_url}}`, `{{login_email}}`, `{{action_link}}`, `{{tenant_name}}`, `{{portal_name}}`.
- RLS: platform admins only; service role full.
- GRANTs included per project rules.

### 2. Campaign log (DB)
`platform_email_campaigns` + `platform_email_campaign_recipients`:
- Campaign: tenant_id, template_slug, subject snapshot, created_by, counts, status.
- Recipient: branch_id, email, status (`queued`/`sent`/`failed`/`skipped_no_email`/`skipped_already_active`), error, sent_at, action_link_expires_at.
- Lets us answer "who got the welcome email, when, did they click".

### 3. Edge Function: `send-branch-welcome-campaign`
Platform-admin gated. Input: `{ tenant_id, template_slug, branch_ids[], dry_run? }`. For each branch:
1. Ensure auth user + `branch_manager` membership exist (reuse `provision-branch-admins` logic, inline).
2. Generate a Supabase recovery link pointed at `/{tenant-slug}/reset-password`. This IS the temp-login mechanism — no plaintext temp password is ever shown or stored (industry standard; matches what Supabase, Auth0, Cognito all do).
3. Render the chosen template with merge tokens, send through `send-email` using tenant branding.
4. Write a row to `platform_email_campaign_recipients`.

Notes:
- "Temporary password" UX is delivered as a one-time set-password link rather than a plaintext password in the email — safer, no need to transmit/store secrets, and `/reset-password` already forces a brand-new password. I'll call this out in the UI copy ("one-time secure login link") so it's clear that's the temp-login mechanism.
- Idempotent: re-sending to a branch that already has an active login is allowed (re-issues a fresh recovery link) and logged as `re_sent`.

### 4. Platform UI: `/platform/communications`
New page `PlatformCommunications.tsx` with three tabs:
- **Compose** — pick tenant → checkbox list of branches (shows branch name, contact email, "has logged in?" badge) → pick template → live preview with the first branch's merge values → "Send to N branches" / "Dry run".
- **Templates** — list/edit `platform_email_templates`. Monaco-lite textarea + token cheatsheet + preview pane.
- **History** — campaigns list, drill into recipients with status pills and error messages; "Resend to failed".

Add nav entry under Platform → Communications. (Existing `PlatformSentMail` stays as the raw outbox log.)

### 5. Forced password set on first login
Already enforced — the recovery link lands on `/reset-password` which requires `updateUser({ password })` before continuing. No change needed beyond confirming the redirect target in the campaign function matches `invite-member`'s pattern (`{appOrigin}/t/{slug}/reset-password`).

## Out of scope (flag for later)
- True marketing campaigns / list segmentation / unsubscribe handling — this is operational onboarding, not marketing. Suggest a dedicated marketing tool if/when needed.
- Scheduled sends, A/B testing, open/click tracking pixels.
- Per-tenant template overrides (platform-level only for now).

## Technical notes
- All new tables get `GRANT` blocks + RLS in the same migration.
- Edge Function uses `verify_jwt` default, validates platform admin via `user_roles`.
- Merge-token renderer is a tiny `{{token}}` replace — no template engine dependency.
- Recovery link generation already proven in `invite-member`; extract into `_shared/inviteLink.ts` so both functions share it.

## Deliverables
1. Migration: `platform_email_templates`, `platform_email_campaigns`, `platform_email_campaign_recipients` + grants/RLS + seed template.
2. `_shared/inviteLink.ts` (refactor from `invite-member`).
3. Edge Function `send-branch-welcome-campaign`.
4. `src/pages/platform/PlatformCommunications.tsx` + child components (Compose / Templates / History) + nav entry.
5. Hooks: `usePlatformEmailTemplates`, `usePlatformEmailCampaigns`.
