-- 1) Enable demo/security gate on 3at1 tenant (mirroring PostNet)
INSERT INTO public.tenant_demo_gate (tenant_id, enabled, headline, disclaimer_html, cookie_days)
VALUES (
  'a513d202-41f7-47eb-97be-47f2354b3bb1',
  true,
  'Concept Demo',
  '<p>Private Concept Demo</p><p>This website is a private, password-protected concept demonstration of the Document Centre online ordering platform.</p><p>It is not a live ordering website, is not available to the public, and is not an official 3@1 platform.</p><p>3@1 names, logos, trademarks, and brand assets belong to their respective owner. They are displayed here only for private demonstration purposes to show how an individual branch storefront could function if properly authorised by the relevant brand owner or franchise rights holder.</p><p>Document Centre is an independent software provider. Document Centre is not 3@1 head office, is not the 3@1 franchisor, and is not authorised to represent the 3@1 brand nationally.</p><p>No rights in the 3@1 brand are claimed by Document Centre.</p>',
  1
)
ON CONFLICT (tenant_id) DO UPDATE
SET enabled = EXCLUDED.enabled,
    headline = EXCLUDED.headline,
    disclaimer_html = EXCLUDED.disclaimer_html,
    cookie_days = EXCLUDED.cookie_days;

-- 2) Comp the "demo" branch on the free 3at1_basic plan (long-dated)
UPDATE public.branch_subscriptions
SET plan_slug = '3at1_basic',
    assigned_plan_slug = '3at1_basic',
    status = 'active',
    billing_status = 'active',
    trial_status = 'comp',
    comp_until = (now() + interval '10 years'),
    override_reason = COALESCE(override_reason, 'Complimentary demo branch (3@1)'),
    assigned_at = COALESCE(assigned_at, now())
WHERE branch_id = 'eb6c6733-dedf-49d6-b4f2-aca533c0ebbe';