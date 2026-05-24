-- Deactivate click rows for finished sizes that are derived via n-up
-- imposition (A5, A6, DL, Letter, Legal). Going forward, these sizes
-- are priced as a fraction of the A3 parent click in the pricing engine.
-- Rows are kept in the table for historical pricing snapshots but no
-- longer appear in lookups (is_active = false) or the rate card editor.
UPDATE public.rate_card_clicks
SET is_active = false
WHERE size IN ('A5', 'A6', 'DL', 'Letter', 'Legal');
