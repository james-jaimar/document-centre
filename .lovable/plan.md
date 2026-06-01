## Diagnosis

Your PostNet assignment **did** save — `tenant_subscriptions` has `assigned_plan_slug = 'postnet'`, `billing_status = 'pending_payment'`, updated today at 12:30 UTC. That's why the badge still shows `pending_payment`.

What it didn't do is populate the parallel "tenant plan assignment" fields that the rest of the system reads from:

- `tenants.assigned_plan_slug` is **NULL**
- `tenants.assigned_region_id` / `discount_*` / `trial_days` are **NULL**
- `plan_assigned_at` is stale (May 29)
- No cascade was run, so `branch_subscriptions` weren't updated

We have two parallel write paths today:

| Path | Writes to | Cascades to branches? |
|---|---|---|
| `TenantSubscriptionDialog` (Platform → Subscriptions) | `tenant_subscriptions` + `tenants.plan_slug` | No |
| `TenantPlanAssignmentCard` → `assign-tenant-plan` edge fn | `tenants.assigned_*` + `apply_tenant_plan_to_branches` RPC | Yes |

So when you assign from the platform dialog, the BillingTab card (and every branch) sees nothing — looks "unsaved".

## Fix

Make `TenantSubscriptionDialog.handleAssign` do both writes in one go:

1. Keep the existing `tenant_subscriptions` upsert (drives `billing_status`, promo, etc.).
2. **Also** invoke `assign-tenant-plan` with the same plan/region/discount/trial values so:
   - `tenants.assigned_plan_slug` + region + discount + trial_days + `plan_assigned_at/by` get set
   - `apply_tenant_plan_to_branches` cascades to every active branch
3. Invalidate `tenant_plan_assignment` and `branch_subscriptions` queries alongside the existing invalidations so the BillingTab card refreshes immediately.
4. Toast wording stays the same; on success include `branches_updated` count.

No schema change, no new RPC — just wiring the dialog to the existing edge function that the per-tenant card already uses.

### File touched

- `src/components/platform/TenantSubscriptionDialog.tsx` — extend `handleAssign` (after the `tenant_subscriptions` upsert succeeds) to call `supabase.functions.invoke("assign-tenant-plan", { body: { tenant_id, assigned_plan_slug, assigned_region_id, assigned_discount_type, assigned_discount_value, assigned_trial_days } })`, then invalidate the extra query keys.

### Out of scope

- Free subscriptions: I'll still call `assign-tenant-plan` so branches inherit the plan; the `billing_status='free'` lives on `tenant_subscriptions` as today.
- No changes to the edge function, RPCs, or DB.

Shall I implement?
