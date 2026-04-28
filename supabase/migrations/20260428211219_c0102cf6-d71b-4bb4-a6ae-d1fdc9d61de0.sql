UPDATE public.email_outbox
SET status = 'queued', locked_at = NULL, locked_by = NULL, next_attempt_at = now()
WHERE id = 'fa8bb344-1489-4063-a0db-011adc12ba2c';

-- Also clear the other stuck row so it doesn't compete and we can isolate
UPDATE public.email_outbox
SET status = 'failed', locked_at = NULL, locked_by = NULL,
    error_message = COALESCE(error_message, 'manually cleared - sender domain mismatch')
WHERE id = 'd3ef3b90-2496-45fa-be01-4b6ccad8f8cb';