-- Ensure pg_cron is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily trial expiry sweep (07:15 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='expire-branch-trials-daily') THEN
    PERFORM cron.unschedule('expire-branch-trials-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'expire-branch-trials-daily',
  '15 7 * * *',
  $$SELECT public.expire_branch_trials();$$
);

-- Bulk-assign postnet plan to every ZA branch currently on 'core'
UPDATE public.branch_subscriptions bs
SET assigned_plan_slug = 'postnet',
    plan_slug          = 'postnet',
    assigned_at        = COALESCE(bs.assigned_at, now()),
    billing_status     = CASE WHEN bs.billing_status = 'free' THEN 'trial_pending' ELSE bs.billing_status END,
    updated_at         = now()
FROM public.branches b
WHERE bs.branch_id = b.id
  AND b.country = 'ZA'
  AND bs.assigned_plan_slug = 'core';

-- Backfill: create a branch_subscription row for any ZA branch that doesn't have one yet
INSERT INTO public.branch_subscriptions
  (branch_id, tenant_id, region_id, plan_slug, assigned_plan_slug, status, billing_status, assigned_at)
SELECT b.id,
       b.tenant_id,
       (SELECT id FROM public.platform_pricing_plans WHERE plan_slug='postnet' AND stripe_price_id='price_1TcUWOLiJIHImIL1hqE4Yiik' LIMIT 1
          -- region_id placeholder; real region_id from ZA region row
       ),
       'postnet',
       'postnet',
       'active',
       'trial_pending',
       now()
FROM public.branches b
LEFT JOIN public.branch_subscriptions bs ON bs.branch_id = b.id
WHERE bs.id IS NULL
  AND b.country = 'ZA';