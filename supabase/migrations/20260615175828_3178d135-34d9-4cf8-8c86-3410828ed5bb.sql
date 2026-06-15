ALTER TABLE public.product_options
ADD COLUMN IF NOT EXISTS manual_values jsonb NOT NULL DEFAULT '[]'::jsonb;