
-- Add slug column to branches (nullable initially for backfill)
ALTER TABLE public.branches ADD COLUMN slug text;

-- Backfill slug from code (lowercase)
UPDATE public.branches SET slug = lower(code) WHERE code IS NOT NULL;

-- For any branches without a code, generate slug from name
UPDATE public.branches 
SET slug = lower(regexp_replace(regexp_replace(trim(name), '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
WHERE slug IS NULL;

-- Add unique constraint per tenant
ALTER TABLE public.branches ADD CONSTRAINT branches_tenant_slug_unique UNIQUE (tenant_id, slug);

-- Make slug NOT NULL now that all rows are backfilled
ALTER TABLE public.branches ALTER COLUMN slug SET NOT NULL;
