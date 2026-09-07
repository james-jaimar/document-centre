# Tenant Communications

Give each tenant their own version of the Communications area so they can run email campaigns to their business accounts and customers, with a personal link for each recipient. Today this only exists for platform admin and only targets branches.

## What a tenant will see

A new **Communications** item in the tenant admin sidebar, visible only to Owner and Admin. Same five-part layout you already use:

- **Compose** — pick the audience, pick a template, preview, dry run, send.
- **Templates** — the tenant's own private templates only. They do not see or edit platform templates.
- **Triggers** — automatic follow-up (e.g. resend to people who didn't open) for their own campaigns.
- **History** — their own campaigns, with sent / opened / clicked / signed-up counts per recipient.

Nudges stays platform-only.

### Audience picker

Two recipient sources, both scoped to the signed-in tenant:

- **Business accounts** — companies on their books, filterable by trade / active, with the company email and primary contact used as the recipient.
- **Customers** — people with a login on that tenant, filterable by branch.

Search, select-all-filtered, and a clear count of how many have a usable email address. Anyone without an email is listed as skipped before sending.

### The link

Per campaign the tenant chooses:

- **Marketing pitch** — each recipient gets their own activation page link on the tenant's own domain; the recipient requests their sign-in from that page.
- **Direct sign-in** — a one-time sign-in link that lands them on the password-setup screen.

Links are minted per recipient at send time and merged into `{{activation_link}}` / `{{action_link}}`. Merge fields available to tenants: contact name, company name, tenant name, store URL, login email, plus the link field for the chosen type.

### Sender

Tenant campaigns send from the tenant's own connected email account (Settings → Email Accounts). If none is connected, sending is blocked with a clear message and a shortcut to that tab — the same pattern used elsewhere for tenant mail.

## Technical notes

Data model:

- Add `tenant_id` (nullable) to `platform_email_templates` and `platform_campaign_triggers`. `NULL` = platform-owned. Tenant rows are created by tenants; slug uniqueness becomes per-tenant.
- Add `company_id` and `profile_id` (nullable) to `platform_email_campaign_recipients` alongside the existing `branch_id`, plus a `recipient_kind` column (`branch` / `company` / `customer`).
- Add `audience` to `platform_email_campaigns`.
- `platform_branch_activation_pages` already carries `tenant_id`; allow `branch_id` to be null and add `company_id` / `profile_id` so an activation page can belong to a company or customer. Same for `platform_onboarding_tokens` (it already has `tenant_id` and `profile_id`; add `company_id`).

RLS: keep existing platform-admin policies and add tenant policies on all five tables — read/write only where `tenant_id` matches the caller's tenant and their `tenant_memberships` role is owner or admin. Templates get an extra read rule so tenants never see `tenant_id IS NULL` rows. Grants stay as they are for `authenticated` / `service_role`.

Edge functions:

- Generalise `send-branch-welcome-campaign` and `send-branch-marketing-campaign`: authorise either a platform admin (any tenant) or a tenant owner/admin (their own tenant only), resolve recipients from the requested audience rather than assuming branches, and pick the sender account — platform mailbox for platform sends, the tenant's active account for tenant sends.
- `get-activation-page`, `request-activation-email`, `redeem-onboarding-token` and `complete-onboarding-token` need to handle company- and customer-scoped pages/tokens, not just branch ones.
- `process-campaign-triggers` filters triggers by campaign ownership.

Frontend:

- Extract the existing tabs out of `PlatformCommunications.tsx` into shared components under `src/components/communications/` parameterised by scope (`platform` | `tenant`), so both portals share one implementation.
- New route `/admin/communications` wrapped in the owner/admin guard, plus the sidebar entry.
- New `AudiencePicker` component for companies/customers.

## Out of scope

Branch-level access, marketing/newsletter compliance features (unsubscribe lists, double opt-in), and scheduling sends for later. Say the word if you want unsubscribe handling included — for bulk cold outreach it is usually worth adding.
