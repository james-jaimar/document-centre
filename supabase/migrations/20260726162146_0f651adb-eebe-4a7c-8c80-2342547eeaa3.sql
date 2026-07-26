-- Self-heal branch_subscriptions rows wedged by a Checkout session that was
-- opened but never completed (no Stripe webhook ever fires in that case).
UPDATE public.branch_subscriptions
SET status = NULL,
    billing_status = NULL,
    updated_at = now()
WHERE status = 'incomplete'
  AND billing_status = 'pending_payment'
  AND stripe_subscription_id IS NULL;