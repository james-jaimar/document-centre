# Fix: contact form stuck on "wait for the security check to finish"

## What's happening

The console on document-centre.com/contact shows the real cause:

> Loading the script 'https://challenges.cloudflare.com/...' violates the following Content Security Policy directive: "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://embed.tawk.to https://*.tawk.to https://cdn.jsdelivr.net https://www.googletagmanager.com". The action has been blocked.

Our production security headers (`customHttp.yml`, served by Amplify) do not allow Cloudflare Turnstile. So the widget script never loads, no token is ever produced, and the form's guard ("if Turnstile is enabled but there's no token, block and toast") fires forever.

## The fix

1. **Allow Turnstile in the CSP** (`customHttp.yml`):
   - `script-src`: add `https://challenges.cloudflare.com`
   - `frame-src`: add `https://challenges.cloudflare.com` (the challenge renders in an iframe)
   - `connect-src`: add `https://challenges.cloudflare.com`
   This requires a redeploy of the Amplify site to take effect.

2. **Never let the form dead-end** (`src/pages/Contact.tsx` + `src/components/marketing/TurnstileWidget.tsx`):
   - Track whether Turnstile actually loaded/errored. If the script fails to load, or no token arrives within ~8 seconds, mark the challenge as unavailable and allow submission without a token.
   - The submission is still fully protected server-side: honeypot, timing trap, IP/email rate limits and spam scoring all still run, and a missing token simply doesn't get the Turnstile bonus.
   - Replace the blocking toast with a short inline "Verifying…" state on the button so the user sees progress rather than a repeated error.

3. **Cloudflare widget hostnames** — confirm the widget for site key `0x4AAAAAAEHsKgbhPAPt2ztL` lists `document-centre.com` (and `www.document-centre.com`) as allowed hostnames, otherwise it will error even once CSP allows it.

## Technical notes

- No database or edge function changes. `verifyTurnstile` in `supabase/functions/_shared/contact-spam.ts` already treats a missing token as a failure only when the secret is configured; with the graceful-degrade path the score penalty is what handles abuse, not a hard block.
- CSP change only affects the published Amplify site; the Lovable preview is unaffected.
