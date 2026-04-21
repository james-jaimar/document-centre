-- Seed demo tenant branding
UPDATE tenants SET logo_url='/document-centre-logo.svg' WHERE slug='demo';

INSERT INTO tenant_settings (tenant_id, category, setting_key, setting_value, value_type, is_sensitive)
SELECT t.id, 'branding', s.k, to_jsonb(s.v), 'string', false
FROM tenants t
CROSS JOIN (VALUES
  ('portal_name','Document Centre'),
  ('logo_url','/document-centre-logo.svg'),
  ('primary_color','#0B2A66'),
  ('secondary_color','#39B6F0'),
  ('accent_color','#34B34A'),
  ('tagline','Web-to-Print Made Easy')
) AS s(k,v)
WHERE t.slug='demo'
ON CONFLICT DO NOTHING;