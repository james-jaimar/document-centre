
ALTER TABLE public.platform_pricing_plans
  ADD COLUMN IF NOT EXISTS trial_offer text NOT NULL DEFAULT 'both'
  CHECK (trial_offer IN ('none','trial_14_no_card','trial_30_with_card','both'));

ALTER TABLE public.branch_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_via text
  CHECK (trial_started_via IN ('no_card_14','stripe_30') OR trial_started_via IS NULL);
