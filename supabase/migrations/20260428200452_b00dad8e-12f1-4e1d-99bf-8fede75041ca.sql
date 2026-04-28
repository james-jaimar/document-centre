UPDATE public.email_outbox
SET status = 'queued',
    locked_at = NULL,
    locked_by = NULL,
    next_attempt_at = now()
WHERE id = 'fa8bb344-1489-4063-a0db-011adc12ba2c'
  AND status = 'sending';