UPDATE public.email_outbox
SET status = 'queued',
    attempts = 0,
    error_message = NULL,
    next_attempt_at = now()
WHERE id = '8e33a1f7-60bb-478d-bfdc-e233bba879fd';