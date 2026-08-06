ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS spam_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spam_reasons text[] NOT NULL DEFAULT '{}';

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.contact_submissions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.contact_submissions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.contact_submissions
  ADD CONSTRAINT contact_submissions_status_check
  CHECK (status IN ('new','read','replied','archived','closed','spam'));

CREATE INDEX IF NOT EXISTS idx_contact_submissions_ip_created
  ON public.contact_submissions (ip_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_email_created
  ON public.contact_submissions (email, created_at DESC);