## Add Gmail OAuth Secrets

Two secrets need to be added to the Supabase Edge Functions environment so the `gmail-oauth-connect` function can authenticate with Google:

1. **GMAIL_OAUTH_CLIENT_ID** — the Client ID from your Google Cloud OAuth 2.0 credentials
2. **GMAIL_OAUTH_CLIENT_SECRET** — the Client Secret from the same credentials

I'll use the secret management tool to prompt you for each value. You'll paste them in when prompted.

After the secrets are stored, the Gmail OAuth flow will be fully operational — tenants can click "Connect Gmail" in their Email Accounts settings to authorize sending via their Gmail/Google Workspace account.
