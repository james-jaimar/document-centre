
-- Create PostNet tenant
INSERT INTO public.tenants (id, name, slug, app_id, legal_name, trading_name, country, default_currency, locale, timezone, onboarding_status, payment_mode, proof_mode, workflow_template, support_email, website_url)
VALUES (
  'c0000000-0000-0000-0000-000000000002',
  'PostNet',
  'postnet',
  'a0000000-0000-0000-0000-000000000001',
  'PostNet (Pty) Ltd',
  'PostNet',
  'ZA',
  'ZAR',
  'en-ZA',
  'Africa/Johannesburg',
  'setup_in_progress',
  'prepaid',
  'optional',
  'prepaid_no_proof',
  'support@postnet.co.za',
  'https://www.postnet.co.za'
);

-- Create number sequence for PostNet orders
INSERT INTO public.number_sequences (app_id, sequence_type, prefix, last_value)
VALUES ('a0000000-0000-0000-0000-000000000001', 'order_postnet', 'PN', 0);
