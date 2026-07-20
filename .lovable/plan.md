## Goal
On the branch's trial conversion view, clearly show any active discount that will apply when they subscribe (e.g. "R250 off/month for the first 3 months") so the offer is visible up-front, not a surprise at Stripe checkout.

## Where the discount data already lives
- `branch_subscriptions.promo_code_id`, `discount_type`, `discount_value` — set by tenant admin when assigning the plan.
- `platform_promo_codes` — human-readable code/name + discount definition (percentage / fixed_amount / free_months).
- `platform_pricing_plans.stripe_coupon_id` / `stripe_promotion_code_id` — the Stripe-side coupon attached to the plan itself.
- `stripe-verify-price` edge function already resolves live coupon details (name, amount_off, percent_off, duration, duration_in_months) for a given price / coupon / promo code and is callable by tenant admins.

Precedence for what to display:
1. Subscription-level promo (`branch_subscriptions.promo_code_id` → `platform_promo_codes` row).
2. Otherwise, plan-level Stripe coupon (`platform_pricing_plans.stripe_coupon_id` or `stripe_promotion_code_id`), resolved live via `stripe-verify-price`.
3. If neither, render nothing (current behaviour).

## Changes

### 1. `src/hooks/useBranchSubscriptions.ts` (or new small hook file)
Add `useBranchActiveDiscount(subscription, assignedPlan)`:
- If `subscription.promo_code_id`: fetch the matching `platform_promo_codes` row (code, name, discount_type, discount_value, duration_in_months if present) and normalise to a common `ResolvedDiscount` shape.
- Else if `assignedPlan?.stripe_coupon_id` or `stripe_promotion_code_id`: call `supabase.functions.invoke("stripe-verify-price", { body: { coupon_id, promotion_code_id, tenant_id } })` and map the returned coupon into the same shape.
- Return `{ label, amountOffMinor, percentOff, currency, durationMonths, source: "promo" | "stripe", code? }`.

Common shape:
```ts
type ResolvedDiscount = {
  label: string;               // "R250 off/month for 3 months"
  firstPeriodPrice: number|null; // discounted monthly price, in plan currency
  standardPrice: number;         // full monthly price
  currency: string;
  durationMonths: number | null; // null = forever
  code?: string | null;
};
```

### 2. `src/components/branch/TrialConversionCard.tsx`
Accept a new optional `discount?: ResolvedDiscount` prop. When present:
- Insert a highlighted "Launch offer" strip directly above "Your plan after trial":
  - Line 1 (bold): the discount label, e.g. `Save R250/month for your first 3 months`.
  - Line 2 (muted): `Pay R499.00/month for 3 months, then R749.00/month.` (or `Save 20% forever` etc.).
  - If `code`, add a small pill showing the code.
- Update the "Subscribe before …" bullet list to include: `Launch discount already applied — you'll pay Rxxx for the first N months.`
- Update the "Your plan after trial" summary line to append `· first 3 months Rxxx` when a limited-duration discount applies.

Keep all wording plan-agnostic and driven by the resolved discount object — no hard-coded R250/Postnet copy.

### 3. `src/components/branch/BranchSubscriptionPanel.tsx`
- Call `useBranchActiveDiscount(subscription, assignedPlan)`.
- Pass the result into `<TrialConversionCard discount={…} />`.

### 4. `stripe-verify-price` — no changes required
It already accepts `{ coupon_id, promotion_code_id, tenant_id }` and permits active tenant admins. Branch owners are typically not tenant admins, so we invoke via the tenant-admin-created assignment context is not available client-side for a branch user. To keep it callable from a branch owner's session, extend the auth check in `stripe-verify-price` to also allow **any active `tenant_memberships` role on `body.tenant_id`** (owner/admin/sales/production/accounts). Read-only Stripe lookup on a coupon already scoped to that tenant's plan is safe. Pass `tenant_id = subscription.tenant_id` from the client.

### 5. Fallback
If `stripe-verify-price` fails (network / coupon deleted), render nothing and log — never block the Subscribe flow.

## Technical notes
- No schema changes.
- No pricing-math changes; Stripe still applies the coupon at checkout — we only mirror it in the UI.
- Currency formatting reuses the existing helpers already used in `TrialConversionCard` for `planPrice`.
- Duration mapping: Stripe `duration: "once" | "repeating" | "forever"` → `durationMonths = 1 | duration_in_months | null`.
