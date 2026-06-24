# SaaS rollout plan

## Status
- Phase 1 (Legal Stack) — done
- Phase 2 (Pre-checkout disclosure + acceptance ledger) — done
- Phase 3 (Subscription lifecycle enforcement) — in progress

## Decisions (locked)
- **Grace window**: 7 days from `current_period_end` (or `now()` if already past).
- **Cancellation**: access until `current_period_end`, no pro-rata refunds.
- **Liability cap**: fees paid in prior 6 months.
- **Availability target**: 99.5% calendar month.
- **VAT**: Jaimar not registered — "VAT not applicable".
- **Retention**: production files 180 days, logs 90 days, order records 5 years.

### Phase 3 specifics (locked this turn)
- **On payment failure**:
  - Storefront checkout blocked **immediately** when sub goes `past_due`.
  - Branch admin portal stays read/write for 7 days of grace, then becomes **read-only with billing as the only writable area**.
- **Trial**: 14 days no card, OR 30 days with card on file (no charge until day 30).
- **Cancelled branches**: storefront `/t/:slug/...` URLs fall through to the friendly "store not online yet" page (a saved customer link is effectively redirected to tenant landing). Branch is removed from the picker and search — it simply won't list.

## Phase 3 work
- DB
  - `branch_subscriptions.grace_until` — 7-day grace window per failure (done).
  - `branches.storefront_closed_at` — flips on `customer.subscription.deleted` (done).
  - `resolve_branch_entitlement(branch_id) → { state, until, reason }` RPC (done).
- Stripe webhook (`stripe-webhook/index.ts`)
  - Set `grace_until` on `invoice.payment_failed` (done).
  - Clear `grace_until` on `invoice.payment_succeeded` (done).
  - Set `branches.storefront_closed_at = now()` on `customer.subscription.deleted` (done).
- Frontend gates
  - `useBranchEntitlement(branchId)` — server-resolved (done).
  - `useBranchSubscriptionGate` — admin: full ↔ billing-only (done).
  - `useBranchStorefrontGate` — checkout block (done).
  - `BranchContext` filters out `storefront_closed_at` so the picker hides closed branches (done).
- Remaining for Phase 3
  - Wire `useBranchStorefrontGate` into `Cart` / checkout buttons (storefront).
  - Wire `useBranchSubscriptionGate` into branch admin layout — read-only banner + lock everything except `Settings → Billing`.
  - Trial selector: extend `assign-branch-plan` / `start-branch-trial` to accept `{ trial_days: 14 | 30, requires_card: bool }`.
  - Dunning emails: day 0 / 3 / 6 / 7 — extend `notifyTenant("invoice_failed", ...)` into a scheduled sweep (`pg_cron` job hitting a `subscription-dunning-sweep` edge function).

## Phase 4 — Tenant self-service
- Branch → Settings → Billing tab (plan, renewal, payment method via Stripe Portal, acceptance history).
- Re-acceptance modal on `LEGAL_DOC_VERSIONS` bump.

## Phase 5 — Platform admin controls
- Platform → Subscriptions list (status, MRR, grace, manual overrides).
- Platform → Legal versioning workflow.
- Admin action audit log.

## Phase 6 — Customer-facing legal
- `/t/:slug/legal/{terms,privacy}` rendered from tenant-configurable templates (branch is merchant of record).
- Checkout consent → `customer_acceptances` tied to the order.
- Storefront cookie banner.

## Phase 7 — Launch readiness
- DPA countersignature (e-sign + ledger row).
- Sub-processor change notifications (30-day notice).
- `/status` page for SLA reporting.
- Security questionnaire pack (SIG-Lite / CAIQ-Lite).
- Runbooks: incident, DSR, breach notification, restore drill.

## Phase 4 — Tenant self-service (DONE)
- `create-branch-portal-session` edge function → Stripe Billing Portal (authz: platform admin OR owner/admin/branch_manager).
- `record-branch-reacceptance` edge function → inserts re-acceptance rows server-side.
- `useBranchBillingSelfService.ts` — `useBranchAcceptanceHistory`, `useBranchDocsNeedingReacceptance`, `useRecordBranchReacceptance`, `useBranchPortalSession`.
- `BranchAcceptanceHistory` table + `BranchReAcceptanceBanner` (auto-shown when `LEGAL_DOCS[slug].version > latest accepted version`).
- "Manage billing in Stripe" button on active subscriptions.
- Wired into Branch → Settings → Subscription tab.

## Phase 5 — Platform admin controls (next)
- Platform → Subscriptions list (status, MRR, grace, manual overrides).
- Platform → Legal versioning workflow.
- Admin action audit log.
