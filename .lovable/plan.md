# Phase 5 — Platform admin controls

Goal: give platform admins (Jaimar staff) a single place to see every branch subscription across every tenant, run manual interventions when Stripe can't, monitor legal document uptake, and keep an immutable record of every staff action.

## 1. Platform Subscriptions list

New page: `/platform/subscriptions`

Columns:
- Tenant → Branch (with link into the tenant/branch admin)
- Plan + interval (monthly/annual)
- Status (active / trialing / grace / past_due / restricted / cancelled)
- MRR contribution (plan price normalised to monthly)
- Renews / grace ends / cancelled on
- Last invoice status
- Actions menu

Header summary cards:
- Active branches, Trialing, In grace, Restricted, Cancelled (last 30d)
- Total MRR, Trial-to-paid conversion (last 90d)

Filters: status, tenant, plan, "in grace only", "trial ending in 7 days".

Sort: MRR desc by default.

Data source: new RPC `platform_list_branch_subscriptions(filters jsonb)` returning a flat view joined with `branches`, `tenants`, `platform_pricing_plans`. Restricted to platform admins via `has_role(auth.uid(), 'platform_admin')`.

## 2. Manual overrides (all four locked in)

Each row's action menu exposes:

1. **Comp** — mark as paid for N days/months without charging.
   - Sets `branch_subscriptions.status = 'active'`, `comp_until = now() + interval`, clears `grace_until`.
   - Cancels Stripe sub at period end so we don't double-bill.
   - Reason field required.

2. **Extend grace** — push `grace_until` forward by N days.
   - Does not touch Stripe.
   - Reason required.

3. **Force cancel** — immediate cancellation.
   - Cancels Stripe sub immediately (`stripe.subscriptions.cancel`).
   - Sets `status='cancelled'`, `branches.storefront_closed_at = now()`.
   - Reason required + confirmation modal.

4. **Reset to trial** — re-issue a fresh trial.
   - Picks 14-no-card or 30-with-card (same selector as `start-branch-trial`).
   - Cancels any existing Stripe sub first.
   - Reason required.

All four go through a single new edge function `platform-subscription-override` that:
- Validates `has_role(auth.uid(), 'platform_admin')`.
- Performs the Stripe call.
- Updates `branch_subscriptions` + `branches`.
- Writes one row to `platform_admin_audit` (see §4).
- Sends a notification email to the tenant owner.

Schema add (column, not table):
- `branch_subscriptions.comp_until timestamptz null`
- `branch_subscriptions.override_reason text null` (last reason; full history lives in the audit log)

`resolve_branch_entitlement` updated: if `comp_until > now()` → return `active` regardless of Stripe status.

## 3. Legal versioning status (code-only, as you chose)

New page: `/platform/legal`

- Lists every doc in `LEGAL_DOCS` (Terms, Privacy, DPA, AUP) with current version + effective date pulled from `src/lib/legal/versions.ts`.
- Below each doc, a table: tenant → branch → latest accepted version → "current" / "stale (v1, needs v2)" badge → last acceptance date.
- Summary: "82 of 91 branches on current Terms v2.1, 9 stale".
- Read-only — no edit UI. Bumping a version is still: edit `versions.ts`, commit, deploy. The re-acceptance banner from Phase 4 takes over from there.

Data source: existing `subscription_acceptances` ledger + `LEGAL_DOCS` constants. New RPC `platform_legal_acceptance_status()` returns the join.

## 4. Admin action audit log

New table `platform_admin_audit`:
- `actor_user_id`, `actor_email_snapshot`
- `action` (`comp` | `extend_grace` | `force_cancel` | `reset_trial` | `legal_version_bump_observed`)
- `target_type` (`branch_subscription` | `tenant` | `legal_doc`)
- `target_id`, `tenant_id`, `branch_id`
- `before_state jsonb`, `after_state jsonb`
- `reason text`
- `ip`, `user_agent`
- `created_at`

RLS: insert from edge functions only (service role); select restricted to platform admins.

New page: `/platform/audit` — filterable table (actor, action, tenant, date range), CSV export. Also surfaced as a "Recent activity" widget on `/platform/subscriptions`.

## 5. Navigation + access

- Add "Subscriptions", "Legal status", "Audit log" entries to the platform admin sidebar (`src/components/PlatformLayout.tsx`).
- All three routes gated by `has_role(auth.uid(), 'platform_admin')` server-side via RPC, plus client-side route guard.

## File summary

New:
- `supabase/functions/platform-subscription-override/index.ts`
- `src/pages/platform/PlatformSubscriptions.tsx`
- `src/pages/platform/PlatformLegalStatus.tsx`
- `src/pages/platform/PlatformAuditLog.tsx`
- `src/components/platform/SubscriptionOverrideDialog.tsx` (one dialog, four modes)
- `src/hooks/usePlatformSubscriptions.ts`

Edited:
- `src/components/PlatformLayout.tsx` (sidebar entries)
- `src/App.tsx` (routes)
- `src/lib/legal/versions.ts` (export helper for status page if needed)
- `supabase/functions/_shared/entitlement.ts` if exists, else inline in webhook — honour `comp_until`.

Migrations:
- Add `comp_until`, `override_reason` to `branch_subscriptions`.
- Create `platform_admin_audit` table + GRANTs + RLS.
- Update `resolve_branch_entitlement` to consider `comp_until`.
- Create `platform_list_branch_subscriptions` and `platform_legal_acceptance_status` RPCs.

## After Phase 5

Phase 6 (customer-facing legal at `/t/:slug/legal/*` + checkout consent + cookie banner) and Phase 7 (DPA countersign, sub-processor notices, `/status` page, security questionnaire pack, runbooks) remain.
