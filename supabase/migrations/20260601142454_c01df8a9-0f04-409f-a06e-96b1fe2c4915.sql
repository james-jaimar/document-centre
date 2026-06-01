-- Override existing PostNet test branches to free/active so the gate stops blocking them
UPDATE public.branch_subscriptions
SET billing_status = 'free',
    status = 'active',
    updated_at = now()
WHERE branch_id IN (
  '3f648164-417c-4a20-adbc-73c96c196dd8', -- PostNet Aliwal North
  '50af6453-1a97-4a1a-bf5b-e3c5b12cf66c'  -- PostNet Sandton City
);