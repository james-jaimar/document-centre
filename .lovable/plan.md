# Blocking the persistent Iranian visitor

## What the data actually shows

No contact-form submissions have landed since 6 Aug — the honeypot, timing trap and Turnstile added last week are holding. The stored spam IPs were Tor exit nodes (185.220.101.x, 171.25.193.x), not the Tehran address Google Analytics shows. So right now the Tehran session is browsing pages, not submitting forms. It is annoying, not (yet) damaging.

There are two levels of response. Level 1 is the real fix; level 2 is what I can build inside the app.

## Level 1 — Cloudflare WAF (recommended, no code)

This stops the traffic before it ever reaches Amplify, and is the only approach that also blocks page-view scraping.

Requires the domain's DNS records in Cloudflare to be **Proxied** (orange cloud). If they are grey (DNS-only), Cloudflare sees nothing and no rule will fire.

Rules to add under Security > WAF > Custom rules:

1. **Block high-risk countries on the form only**
   `http.request.uri.path contains "/contact"` and `ip.geoip.country in {"IR" "KP" "RU" "CN"}` -> Managed Challenge
2. **Threat-score gate sitewide**
   `cf.threat_score > 20` -> Managed Challenge
3. **Block Tor**
   `ip.geoip.country eq "T1"` -> Block
4. **Rate limit** the contact endpoint: 5 requests / 10 minutes per IP -> Block for 1 hour.

Start with Managed Challenge rather than Block so a genuine visitor can still get through.

## Level 2 — App-side blocklist (if Cloudflare isn't proxied, or as belt-and-braces)

Server-side only, inside the Supabase edge functions — nothing in the browser can be bypassed.

- New table `abuse_ip_blocks`: `cidr`, `reason`, `country_code`, `created_at`, `expires_at`, `hits`. Platform-admin RLS only, `service_role` full access.
- Seed with the known Tor exit ranges already seen in `contact_submissions`.
- `submit-contact` gains an early check: if the caller IP falls inside a blocked CIDR, increment `hits` and return the existing silent-OK response (no row stored, no email). Bots learn nothing.
- Optional country rule: score `+5` when the request's country header (already read by `detect-region`) is in a configurable high-risk list, so it trips the existing spam threshold rather than hard-blocking.
- Small platform admin screen at `/platform/security` listing blocked ranges, hit counts, and recent flagged submissions with IP + country, plus add/remove.

## What I would not do

- Hard-block Iran across the whole site at app level. It only affects form posts, breaks nothing for the bot (it can use Tor, as it already does), and risks blocking a legitimate visitor.
- Chase the GA Tehran session specifically. GA IPs are approximate and it has not submitted anything.

## Technical notes

- IP is read from `cf-connecting-ip`, falling back to `x-forwarded-for` — already implemented in `submit-contact/index.ts`.
- CIDR matching runs in Postgres via the `inet`/`cidr` operators (`ip <<= cidr`) in a single indexed lookup, so no per-request list download.
- Blocklist check runs before the Turnstile call to save the round trip.
