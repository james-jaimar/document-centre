
-- Create upload_sessions table for QR code mobile uploads
CREATE TABLE public.upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  order_item_id uuid REFERENCES public.order_jobs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_id uuid NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  is_active boolean NOT NULL DEFAULT true,
  file_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast token lookup
CREATE INDEX idx_upload_sessions_token ON public.upload_sessions (token) WHERE is_active = true;

-- Trigger for updated_at
CREATE TRIGGER set_upload_sessions_updated_at
  BEFORE UPDATE ON public.upload_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.upload_sessions ENABLE ROW LEVEL SECURITY;

-- Creator can read their own sessions
CREATE POLICY "Creator can view own upload sessions"
  ON public.upload_sessions FOR SELECT
  USING (created_by = auth.uid());

-- Creator can update their own sessions (e.g. deactivate)
CREATE POLICY "Creator can update own upload sessions"
  ON public.upload_sessions FOR UPDATE
  USING (created_by = auth.uid());

-- Authenticated users can create sessions (for their own tenant)
CREATE POLICY "Users can create upload sessions"
  ON public.upload_sessions FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND public.user_has_membership(app_id, tenant_id)
  );

-- Staff can view sessions for their tenant
CREATE POLICY "Staff can view tenant upload sessions"
  ON public.upload_sessions FOR SELECT
  USING (public.user_is_staff_for(app_id, tenant_id));

-- Enable realtime on documents table for live sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
