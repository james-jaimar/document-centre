"""Email dispatch module.

Sends outbound email from `public.email_outbox` rows (enqueued by Supabase
Edge Functions) via per-tenant SMTP credentials stored in
`public.email_accounts` with secrets in the Supabase vault.

Architecture:
    Celery beat → email.scan_outbox (claims a batch via claim_email_batch RPC)
                → fan-out email.send tasks on the `emails-default` queue
                → SMTP via aiosmtplib, mark sent/failed, record metrics.
"""
