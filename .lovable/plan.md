
## Goal

Establish a **dedicated platform-level email sender** (separate from any tenant's mailbox) used for all Document Centre platform-to-tenant communications: platform admin invites, subscription/trial/billing notifications, tenant onboarding, system announcements, etc. Manage it from a new **Platform Settings → Email** screen, then wire the notification call sites.

## Architecture

### Data model
Keep the existing `email_accounts` table. A "platform account" is simply a row where:
- `tenant_id IS NULL`
- `branch_id IS NULL`
- `transport IN ('graph_oauth','graph','gmail_oauth','smtp')` (Graph OAuth recommended)
- `is_active = true`
- `is_default = true` (only one platform default allowed)

Add a partial unique index to enforce "only one default platform account":
```sql
create unique index email_accounts_platform_default_uniq
  on email_accounts ((true))
  where tenant_id is null and branch_id is null and is_default = true;
```

RLS: platform admins (`has_role(auth.uid(),'platform_admin')`) can select/insert/update/delete rows where `tenant_id IS NULL`. Existing tenant policies remain unchanged.

### Resolution change (`supabase/functions/_shared/email-queue.ts`)
Replace the final fallback block. New precedence:

1. explicit `email_account_id`
2. branch default
3. tenant default → any active tenant account
4. **Platform default**: `tenant_id IS NULL AND branch_id IS NULL AND is_active AND is_default`
5. Any active platform account (`tenant_id IS NULL`) ordered by `created_at`
6. Legacy fallback: first active Graph/Graph-OAuth account anywhere (kept as last resort, transport list widened to `('graph','graph_oauth')`)

This way `tenant_id: null` callers (e.g. `invite-platform-admin`) deterministically hit the platform mailbox, and tenant callers still prefer their own configured account.

### OAuth connect flow
Reuse existing `microsoft-oauth-connect` edge function. Add a `scope: 'platform'` parameter (or `tenant_id: null` signal) so it inserts/updates the row with `tenant_id=null, branch_id=null`. Guard with platform-admin check.

## UI: Platform Settings → Email

New tabbed structure in `src/pages/platform/PlatformSettings.tsx` (currently only has the storage wipe panel — move that into a "Danger Zone" tab):

```
Platform Settings
├── Email (new — default tab)
├── Notifications (new)
└── Danger Zone (existing wipe-storage panel)
```

### Email tab (`PlatformEmailTab.tsx`)
Mirrors the tenant `EmailAccountsTab` UX but scoped to platform rows:
- List platform email accounts (filter `tenant_id IS NULL`).
- "Connect Microsoft 365" button → OAuth popup (platform scope) → on return, row created/updated with `transport='graph_oauth'`.
- "Connect Gmail" button (optional, same pattern).
- "Add SMTP account" form (fallback).
- Per-row: From name, From email, Transport, Status, Last test, Set Default, Disable, Send test email, Disconnect.
- Show OAuth connection health (refresh-token age, last successful send).

New hook `usePlatformEmailAccounts` (analogous to existing tenant hook, queries with `is('tenant_id', null)`).

### Notifications tab (`PlatformNotificationsTab.tsx`)
Per-event toggle + recipient policy stored in a new `platform_settings` table (or reuse `tenant_settings` with `tenant_id=null` — see note below). Events:

| Event | Default | Recipient |
|---|---|---|
| Tenant created | on | tenant owner + platform admins |
| Tenant onboarding completed | on | platform admins |
| Plan assigned / changed | on | tenant owner(s) |
| Trial started | on | branch billing email |
| Trial ending (3 days) | on | branch billing email |
| Subscription past_due | on | tenant owner + platform admins |
| Subscription cancelled | on | tenant owner |
| Stripe invoice paid | off | tenant owner |
| Stripe invoice failed | on | tenant owner + platform admins |
| Platform admin invite | on | invitee |

Store as `platform_settings(category, setting_key, setting_value jsonb)` — new table, simpler than overloading `tenant_settings`.

## Wire up notifications

Add a shared helper `supabase/functions/_shared/platform-notify.ts`:

```ts
export async function platformNotify(admin, {
  event,            // 'subscription_plan_changed' etc.
  recipients,       // string[] or resolver
  templateData,     // { tenant_name, plan, ... }
  tenant_id,        // for audit/related_id only — kept on row
  related_type, related_id,
})
```

It:
1. Loads the toggle from `platform_settings` (skip if disabled).
2. Renders a minimal HTML/text template (templates under `_shared/templates/platform/{event}.ts`).
3. Calls `enqueueEmail` with `tenant_id: null` so resolution picks the **platform** account (not the affected tenant's).
4. Calls `kickEmailWorker()`.

Inject `platformNotify` calls into:
- `assign-tenant-plan` → plan_changed
- `assign-branch-plan`, `override-branch-subscription` → plan_changed (branch)
- `start-branch-trial` → trial_started
- `stripe-webhook` → invoice_failed, subscription_cancelled, (optional) checkout_completed
- `invite-platform-admin` → already enqueues; just confirm `tenant_id: null` resolves to platform account now
- New: `tenant-created` trigger (or call from existing tenant-create flow if any)

A future cron (out of scope for this plan) handles trial_ending_3_days.

## Technical notes / files touched

**Migrations**
- New table `platform_settings (id, category, setting_key, setting_value jsonb, value_type, updated_at)`. GRANTs to authenticated (read via RLS limited to platform admins) + service_role. RLS: only platform admins can read/write.
- Partial unique index on `email_accounts` for platform default.
- RLS additions on `email_accounts` for platform-admin access to NULL-tenant rows.

**Edge functions**
- `_shared/email-queue.ts`: new resolution order (above).
- `_shared/platform-notify.ts`: new helper + templates dir.
- `microsoft-oauth-connect`: accept `scope: 'platform'`, write NULL-tenant row, gate on platform-admin role.
- `gmail-oauth-connect` (if present): same.
- `assign-tenant-plan`, `assign-branch-plan`, `override-branch-subscription`, `start-branch-trial`, `stripe-webhook`: add `platformNotify` calls.

**Frontend**
- `src/pages/platform/PlatformSettings.tsx`: convert to tabbed layout.
- `src/pages/platform/settings/PlatformEmailTab.tsx` (new).
- `src/pages/platform/settings/PlatformNotificationsTab.tsx` (new).
- `src/pages/platform/settings/PlatformDangerZoneTab.tsx` (extract existing wipe panel).
- `src/hooks/usePlatformEmailAccounts.ts` (new).
- `src/hooks/usePlatformSettings.ts` (new — mirror of `useTenantSettings`).
- Route already exists (`/platform/settings`); no router changes needed.

**Out of scope (follow-up)**
- Trial-ending cron job.
- Template editor UI (templates ship as code initially; admin-editable later).
- Per-tenant override of platform notification toggles.

## Rollout order

1. Migration: `platform_settings` table + `email_accounts` index/RLS.
2. Edge: update `_shared/email-queue.ts` resolution; extend `microsoft-oauth-connect` for platform scope.
3. UI: Platform Settings tabs + Email tab (lets you actually connect the mailbox).
4. Helper + templates: `_shared/platform-notify.ts`.
5. Notifications tab (toggle wiring) + inject `platformNotify` calls into the 5 edge functions listed.
6. Smoke test: connect M365, send test email, assign a plan, force a failed invoice in Stripe test mode.
