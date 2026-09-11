ALTER TABLE public.platform_email_templates
  ADD COLUMN IF NOT EXISTS editor_mode text NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS preheader text;

ALTER TABLE public.platform_email_templates
  DROP CONSTRAINT IF EXISTS platform_email_templates_editor_mode_check;
ALTER TABLE public.platform_email_templates
  ADD CONSTRAINT platform_email_templates_editor_mode_check
  CHECK (editor_mode IN ('simple', 'advanced'));

COMMENT ON COLUMN public.platform_email_templates.editor_mode IS 'simple uses the rich-text editor; advanced preserves complete imported email HTML';
COMMENT ON COLUMN public.platform_email_templates.preheader IS 'Inbox preview text for marketing email clients';