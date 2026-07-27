ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS show_country_selector boolean NOT NULL DEFAULT false;
UPDATE public.tenants SET show_country_selector = true WHERE slug = 'postnet';