## Diagnosis

- The order gate is doing the right branch-level check: it allows orders only when the selected branch subscription is `active`/`trialing` or billing is `paid`/`free`.
- Both PostNet Sandton City and PostNet Aliwal North currently have branch subscription rows, but they are still `status = incomplete` and `billing_status = pending_payment`, so the gate blocks orders.
- The `postnet` plan is not universally free: there is a ZA branch plan at `499.00` with a Stripe price, plus other regional `0.00` rows. So relying on tenant-level inheritance/price inference keeps producing ambiguous results.

## Plan

1. **Add a direct branch override action**
   - Add a clear admin action on the branch subscription card: **Activate branch / comp subscription**.
   - This updates only that branch’s subscription to `status = active` and `billing_status = free`.
   - This is the override you need for testing, onboarding, or branches where payment/login should not block orders.

2. **Add an Edge Function for the override**
   - Create `override-branch-subscription`.
   - It will require a logged-in user and allow only platform admins or tenant owner/admins for that branch.
   - It will upsert/update `branch_subscriptions` for the specific `branch_id` only.

3. **Keep the order gate unchanged**
   - No changes to `order-engine` or `branch_subscription_active` are needed.
   - Once the branch row is overridden to `free/active`, existing logic will immediately allow orders.

4. **Backfill the two affected PostNet test branches now**
   - Update Sandton City and Aliwal North branch subscriptions to `free/active` so the immediate blocker is removed.

5. **Improve admin visibility**
   - Show `free` as a green/active billing badge in branch subscription views.
   - Leave tenant plan billing separate from branch subscription status, so it stays branch-level as requested.

## Technical details

- Database migration: add a `SECURITY DEFINER` RPC or use the new Edge Function service-role update path for branch-only override.
- Frontend: update `BranchSubscriptionAssignCard.tsx` and `useBranchSubscriptions.ts` with the override mutation.
- No new tables are required.
- No global tenant pending-payment logic will be added.