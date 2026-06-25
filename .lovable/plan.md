## Two fixes

### 1. Checkout shows "(sandbox)" even though branch is set to Live

`src/pages/dashboard/Checkout.tsx` (line 71/88) reads `mode` only from `tenant_payment_gateways`. The branch's own `mode` from `branch_payment_gateways` is ignored, so a branch on **Live** still labels the option as sandbox if the tenant row was left as test.

**Fix:** include `mode` in the branch query and, when branch creds exist, use the branch mode for that provider at checkout.

```text
tenant row:  payfast, mode=test, creds=null
branch row:  payfast, mode=live, creds=set      ← effective mode = live
→ checkout label: "PayFast"  (no "(sandbox)" suffix)
```

### 2. Branch card doesn't clearly say "you're live"

Today the only signal is the small "Credentials saved" badge plus the mode dropdown. The user reads the dropdown as a selector, not as the current effective state.

**Fix:** in `PaymentGatewaysCard.tsx` add a second badge next to "Credentials saved" that reflects the effective mode and whether checkout will actually offer it:
- Green **"Live — accepting payments"** when `hasCreds && mode==='live' && isEnabledAtTenant`
- Amber **"Sandbox — test mode"** when `hasCreds && mode==='test' && isEnabledAtTenant`
- Grey **"Disabled at tenant level"** when creds exist but tenant has the provider off

No backend changes. Frontend-only.

### Files touched
- `src/pages/dashboard/Checkout.tsx` — extend branch gateway query with `mode`, prefer branch mode in the filter/display
- `src/components/payments/PaymentGatewaysCard.tsx` — add effective-state badge
