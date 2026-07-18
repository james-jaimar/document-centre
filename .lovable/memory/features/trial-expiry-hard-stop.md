---
name: Trial expiry hard-stop (pending)
description: When a branch's 14-day trial ends without a paid subscription, storefront goes dark and branch admin is billing-only
type: feature
---
When `branch_subscriptions.trial_ends_at` passes without an active paid subscription:
- The customer-facing storefront for that branch must be blocked (dark/closed page, no ordering).
- The branch admin portal must only allow access to the Billing/Subscription pages; all other admin routes redirect to Billing.
- A modal/banner nudges the branch to add a payment method or pick a plan.
- Reactivation is immediate once a valid subscription exists.

Not yet implemented — enforcement gate + storefront guard + admin redirect need to be built.
