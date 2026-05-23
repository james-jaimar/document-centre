-- Backfill missing master rate-card click lines for product-option coverage.
-- sell_price/cost_price = 0 placeholder. Existing rows untouched.
INSERT INTO public.rate_card_clicks (scope_type, tenant_id, size, colour, sides, sell_price, cost_price, is_active) VALUES
('master', NULL, 'A5', 'mono', 'simplex', 0, 0, true),
('master', NULL, 'A5', 'mono', 'duplex', 0, 0, true),
('master', NULL, 'A5', 'colour', 'simplex', 0, 0, true),
('master', NULL, 'A5', 'colour', 'duplex', 0, 0, true),
('master', NULL, 'A6', 'mono', 'simplex', 0, 0, true),
('master', NULL, 'A6', 'mono', 'duplex', 0, 0, true),
('master', NULL, 'A6', 'colour', 'simplex', 0, 0, true),
('master', NULL, 'A6', 'colour', 'duplex', 0, 0, true),
('master', NULL, 'Letter', 'mono', 'simplex', 0, 0, true),
('master', NULL, 'Letter', 'mono', 'duplex', 0, 0, true),
('master', NULL, 'Letter', 'colour', 'simplex', 0, 0, true),
('master', NULL, 'Letter', 'colour', 'duplex', 0, 0, true),
('master', NULL, 'Legal', 'mono', 'simplex', 0, 0, true),
('master', NULL, 'Legal', 'mono', 'duplex', 0, 0, true),
('master', NULL, 'Legal', 'colour', 'simplex', 0, 0, true),
('master', NULL, 'Legal', 'colour', 'duplex', 0, 0, true);