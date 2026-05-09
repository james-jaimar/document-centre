-- Add is_live flag and url_slug to branches
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS is_live boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS url_slug text;

-- Validate url_slug format (lowercase alphanumeric + hyphens) and uniqueness per tenant
CREATE OR REPLACE FUNCTION public.validate_branch_url_slug()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved text[] := ARRAY['orders','cart','checkout','account','auth','dashboard','print-centre','settings','terms','privacy','upload','t','admin','platform','branch','app','api','public','assets','static'];
BEGIN
  IF NEW.url_slug IS NOT NULL THEN
    IF NEW.url_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
      RAISE EXCEPTION 'url_slug must be lowercase alphanumeric with optional hyphens (got: %)', NEW.url_slug;
    END IF;
    IF NEW.url_slug = ANY(reserved) THEN
      RAISE EXCEPTION 'url_slug "%" is a reserved word', NEW.url_slug;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS branches_validate_url_slug ON public.branches;
CREATE TRIGGER branches_validate_url_slug
  BEFORE INSERT OR UPDATE OF url_slug ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.validate_branch_url_slug();

-- Unique per tenant (only when set)
CREATE UNIQUE INDEX IF NOT EXISTS branches_tenant_url_slug_unique
  ON public.branches (tenant_id, url_slug)
  WHERE url_slug IS NOT NULL;

-- Backfill: mark currently-active branches that were NOT part of the PostNet bulk import as live.
-- This preserves existing single/multi-branch tenants while keeping the 454 imported PostNet stores dormant.
UPDATE public.branches
SET is_live = true
WHERE is_active = true
  AND COALESCE(settings->>'source', '') <> 'postnet_csv_2026_05';

-- Index for fast picker queries
CREATE INDEX IF NOT EXISTS branches_tenant_live_idx
  ON public.branches (tenant_id, is_live)
  WHERE is_active = true AND is_live = true;