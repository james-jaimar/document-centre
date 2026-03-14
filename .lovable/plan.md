

## SMTP Email Edge Function Setup

### What we're doing
Storing your SMTP credentials as secrets and creating a reusable `send-email` Edge Function that sends emails via SMTP from `hello@jaimar.dev`. This will handle all app emails (welcome, password reset, notifications) instead of Supabase's built-in emails.

### SMTP Details
- **Host:** mail.jaimar.dev
- **Port:** 465 (SSL)
- **From:** hello@jaimar.dev

### Steps

1. **Store secrets** — Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` as Supabase Edge Function secrets

2. **Create Edge Function** — `supabase/functions/send-email/index.ts`
   - Accepts `to`, `subject`, `html` (and optional `text`) in the request body
   - Uses Deno's SMTP client (`denomailer`) to send via mail.jaimar.dev:465
   - Includes CORS headers for browser calls
   - Validates auth (service role or authenticated user)

3. **Update config.toml** — Add `[functions.send-email]` with `verify_jwt = false` (we validate in code)

4. **Deploy** — Auto-deploy the edge function

### Usage from the app
```typescript
await supabase.functions.invoke('send-email', {
  body: { to: 'user@example.com', subject: 'Welcome', html: '<h1>Hello</h1>' }
});
```

This becomes the foundation for all future email needs — admin invites, order confirmations, password resets, etc.

