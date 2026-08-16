ALTER TABLE public.catalog_papers
  ADD COLUMN IF NOT EXISTS weight_lb numeric,
  ADD COLUMN IF NOT EXISTS lb_basis text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalog_papers_lb_basis_check'
  ) THEN
    ALTER TABLE public.catalog_papers
      ADD CONSTRAINT catalog_papers_lb_basis_check
      CHECK (lb_basis IS NULL OR lb_basis IN ('text','cover','index','bond','pt'));
  END IF;
END $$;

COMMENT ON COLUMN public.catalog_papers.weight_lb IS 'US/CA basis weight in pounds (or points when lb_basis = pt). Display only — gsm remains the value used for weight and shipping maths.';
COMMENT ON COLUMN public.catalog_papers.lb_basis IS 'Basis for weight_lb: text, cover, index, bond, or pt (caliper).';