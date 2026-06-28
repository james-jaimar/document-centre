## Goal
Add a public "Request activation" landing page that PostNet branches can hit from the marketing email, plus a way to mint per-branch activation links in bulk so the email merge field resolves to the right URL per recipient.

## How it ties together
The `/activate/:slug` flow, `get-activation-page` and `request-activation-email` Edge Functions, and the `platform_branch_activation_pages` table already exist. We just need to:
1. Make that page reachable on the PostNet custom domain, publicly (bypassing the demo gate).
2. Generate one `platform_branch_activation_pages` row per PostNet branch.
3. Give you the merge-field URL to drop into the marketing email.

## Plan

### 1. Public route on custom domains
- Ensure `/activate/:slug` is registered on tenant hosts (custom domain + `/t/:slug`) and rendered **outside** the `DemoGateGuard` wrapper, so recipients never hit the password screen first.
- Use the resolved tenant's branding (logo, primary colour) already returned by `get-activation-page` — no change needed there.

### 2. Bulk-generate activation pages for PostNet branches
- Add a small Platform admin action: "Generate activation links for all branches of this tenant".
- For each PostNet branch with a contact email on file:
  - Create a `platform_branch_activation_pages` row if one doesn't exist (idempotent by `branch_id`).
  - Slug pattern: `<branch-slug>-<6char-nano>` (URL-safe, unguessable, branch-readable).
  - `is_active = true`.
- Show the resulting table in the UI (branch name, contact email, full activation URL, copy button, CSV export) so you can paste the per-branch URL into your campaign tool's merge data.
- Skips branches that already have an active page; reports any branches missing a contact email so you can fix and re-run.

### 3. Marketing-email merge field
- Each campaign recipient gets `{{activation_url}}` = `https://postnetprintcenter.com/activate/<slug>` from the CSV/merge data exported in step 2.
- Email body: replace your current "see the demo" link with two clear links — *Browse the demo* (password: postnet) and *Activate my branch* ({{activation_url}}).

### 4. Page behaviour (already built — keeping current behaviour as you asked)
- Visitor lands on `/activate/<slug>` → sees branded page with masked contact email and branch name.
- Enters their email to confirm match → success state: "Check your inbox — link sent to j••••••@postnet.co.za".
- Existing rate limiting (1/min, 3/hour per slug) and generic-response anti-enumeration stay as-is.

## Technical notes
- Routing change: in `src/App.tsx`, move the `/activate/:slug` route so it resolves on tenant-host renders without being wrapped by `<DemoGateGuard>`. The route already exists at the root level; we just need to mirror it for custom-domain rendering and confirm `SubdomainRouter` doesn't fall through to the gate for this path.
- Bulk-generate: new Edge Function `bulk-generate-activation-pages` (platform-admin only) taking `tenant_id`, returning the created/skipped rows. Slug uses `nanoid`-style suffix for uniqueness.
- New UI: small panel under Platform → Tenants → PostNet (or wherever the existing activation-pages list lives) with a "Generate for all branches" button and the resulting table with copy/CSV export.
- No schema changes — `platform_branch_activation_pages` already has everything we need.

## What you'll do after this ships
1. Click "Generate activation links" on the PostNet tenant.
2. Export the CSV (branch name, contact email, activation URL).
3. Drop the CSV into your mail-merge tool with `{{activation_url}}` mapped to the URL column.
4. Send the campaign.
