## Auto-activate tenant + auto-lift demo gate on first branch subscription

When any branch of a tenant enters a live subscription state (14-day no-card trial, 30-day Stripe trial, or paid checkout), automatically:

1. **Flip the tenant to live** — set `tenants.is_active = true` if it isn't already. This is what the storefront hooks (`useTenantFromHost`, `useTenantFromSlug`) gate on, so the store becomes reachable.
2. **Lift the demo/security page for that tenant** — if `tenant_demo_gate.enabled = true`, flip it to `false` the first time any branch under that tenant activates. A real live branch means the concept-demo disclaimer is no longer appropriate.

Both actions are idempotent and one-way (we don't re-disable if a subscription later cancels — admins keep manual control from that point on).

### Where to hook

Three entry points cover every activation path:

- `supabase/functions/start-branch-trial/index.ts` — after the successful `start_branch_trial` RPC (14-day no-card).
- `supabase/functions/create-branch-checkout/index.ts` — right after stamping `trial_started_via: "stripe_30"` / creating the Stripe session (covers 30-day trial-with-card and Activate-now paid).
- `supabase/functions/stripe-webhook/index.ts` — inside `checkout.session.completed` and `customer.subscription.updated` when status becomes `active` or `trialing`, as the authoritative safety net (in case the browser never returns from Stripe).

### Shared helper

Add a small helper (inline in each function or as a shared util) `activateTenantOnFirstLiveBranch(sb, tenantId)` that runs two updates with the service-role client:

```ts
// 1. Ensure tenant is live
await sb.from("tenants")
  .update({ is_active: true })
  .eq("id", tenantId)
  .eq("is_active", false);   // no-op if already live

// 2. Lift demo gate (only if currently enabled)
await sb.from("tenant_demo_gate")
  .update({ enabled: false })
  .eq("tenant_id", tenantId)
  .eq("enabled", true);
```

Both updates are guarded by the current value so they only write once and don't fight an admin who intentionally re-enables either later.

### Notes

- No schema changes required — `tenants.is_active` and `tenant_demo_gate.enabled` already exist.
- Existing `StorefrontEntitlementGuard` / branch-level gates continue to control per-branch access; this only unblocks the tenant-wide storefront and removes the demo overlay.
- No UI change; the platform admin still sees the toggles in `PlatformTenants` and `DemoModeCard` and can override manually.
- Emit a short `console.log` from each entry point so we can trace which path triggered the flip in edge-function logs.

Ready to build once you approve.