
CREATE TABLE public.platform_legal_documents (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  published_version INT NOT NULL DEFAULT 0,
  published_html TEXT,
  published_at TIMESTAMPTZ,
  published_by UUID,
  effective_date DATE,
  draft_html TEXT,
  draft_updated_at TIMESTAMPTZ,
  draft_updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_legal_documents TO anon;
GRANT SELECT, INSERT, UPDATE ON public.platform_legal_documents TO authenticated;
GRANT ALL ON public.platform_legal_documents TO service_role;

ALTER TABLE public.platform_legal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read platform legal docs"
  ON public.platform_legal_documents FOR SELECT
  USING (true);

CREATE POLICY "Platform admins can insert platform legal docs"
  ON public.platform_legal_documents FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

CREATE POLICY "Platform admins can update platform legal docs"
  ON public.platform_legal_documents FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

CREATE TRIGGER trg_platform_legal_documents_updated_at
  BEFORE UPDATE ON public.platform_legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.platform_legal_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL REFERENCES public.platform_legal_documents(slug) ON DELETE CASCADE,
  version INT NOT NULL,
  html TEXT NOT NULL,
  effective_date DATE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slug, version)
);

GRANT SELECT ON public.platform_legal_versions TO anon;
GRANT SELECT, INSERT ON public.platform_legal_versions TO authenticated;
GRANT ALL ON public.platform_legal_versions TO service_role;

ALTER TABLE public.platform_legal_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read platform legal versions"
  ON public.platform_legal_versions FOR SELECT
  USING (true);

CREATE POLICY "Platform admins can insert platform legal versions"
  ON public.platform_legal_versions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

INSERT INTO public.platform_legal_documents (slug, title) VALUES
  ('dpa',           'Data Processing Addendum'),
  ('billing',       'Billing & Cancellation Policy'),
  ('aup',           'Acceptable Use Policy'),
  ('sla',           'Service Availability'),
  ('subprocessors', 'Sub-processors'),
  ('security',      'Security & Backups'),
  ('cookies',       'Cookie Policy')
ON CONFLICT (slug) DO NOTHING;
