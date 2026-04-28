-- Deactivate the legacy Postnet SMTP email account so the dispatcher cannot pick it.
UPDATE public.email_accounts
SET is_active = false, updated_at = now()
WHERE id = '3aec96f3-5331-405d-a009-cf86bb460546';

-- Re-queue the four contact-form emails that previously failed against the
-- now-disabled SMTP fallback so they can be re-sent via Microsoft Graph.
UPDATE public.email_outbox
SET status = 'queued',
    error_message = NULL,
    locked_at = NULL,
    locked_by = NULL,
    attempts = 0,
    next_attempt_at = now()
WHERE id IN (
  '1662eb55-18b8-4571-af0d-2d28d7fcad21',
  '240f4c06-33c0-4e24-9a35-dacc056ff714',
  '5887019a-38a4-4e64-874d-3a75d40ae492',
  '95451cb1-2647-4152-a4cf-1d16ab9ffc77'
);