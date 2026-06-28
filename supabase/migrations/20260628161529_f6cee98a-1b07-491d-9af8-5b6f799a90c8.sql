ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'ZA';

ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_country_code_format_chk;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_country_code_format_chk
  CHECK (country_code ~ '^[A-Z]{2}$');