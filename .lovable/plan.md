# Blocking the abusive traffic

## What the data actually shows

Two separate things are going on — worth separating them before we block anything.

**1. The contact-form spam is not Tehran.** The 16 bot submissions stored between 4 and 6 August came from Tor exit nodes and bulletproof hosts spread across several countries: `185.220.101.x`, `185.220.100.241`, `171.25.193.78` (all well-known Tor exits), `45.84.107.x`, `109.70.100.8`, `193.189.100.204`, `179.60.149.108`, `80.67.172.162`, `185.181.61.203`. Every one used the identical spoofed Mac Chrome user-agent, a random-letter name and subject, and a 10-digit number as the message. No single IP repeats more than twice — blocking individual IPs would achieve nothing, they rotate every submission.

**2. The defences we added yesterday are working.** The edge function log at 03:30 this morning shows `submit-contact: honeypot triggered, discarding` — a bot hit the form and was silently dropped, nothing stored, no auto-reply sent, no bounce-back. That is the whole backscatter problem solved. The 16 spam rows still sitting at `status = 'new'` with `spam_score = 0` are pre-deployment rows; they predate the scoring.

**3. The Tehran visitor in Google Analytics is a different signal.** GA Realtime shows 1 active user, 23 page views, source "(not set)". That is a browsing session, not a form submission — none of the stored spam IPs are Iranian. It could be a scraper, a curious person, or a VPN exit. Right now there is no evidence it has done anything harmful; we have no server access log tying it to any attack. I'd rather confirm what it's doing than block on a country flag alone.

## Proposed work

### 1. Clean up the existing spam rows
Mark the 16 known-bot submissions as `status = 'spam'` with a retro reason, so the admin contact list only shows real enquiries (there are 3: James Hawkins x2 from April, and one genuine "demo request" from 6 Aug).

### 2. Tor / known-abuse IP blocking at the edge function
Add an IP reputation check to `submit-contact` before anything is stored:
- Maintain a small blocklist table (`abuse_ip_blocks`: CIDR, reason, added_at) seeded with the Tor exit ranges already observed.
- Any submission from a blocked range is silently accepted-and-dropped, same as the honeypot.
- Admin UI: a simple list under the contact submissions page to add/remove ranges, and a one-click "block this IP" on any spam row.

This is the right layer for form abuse because it rotates IPs but stays inside a small set of known networks.

### 3. Real blocking belongs at Cloudflare, not in the app
The app can only refuse a request after it has already reached Supabase/Amplify. To actually stop someone hitting the site, the rules go in Cloudflare — but only if the DNS records for `document-centre.com` are **proxied** (orange cloud), not DNS-only. I'll confirm that first. Once proxied, I'll give you the exact rules to paste:
- WAF custom rule: block `cf.threat_score > 20` on `/contact`.
- WAF custom rule: managed challenge for `ip.geoip.country in {"IR" "KP" "RU"}` (or block, your call) — a challenge is safer than a block, it lets a genuine visitor through.
- WAF custom rule: block requests where `cf.client.bot` is true and the path is `/contact`.
- Rate limiting rule: 5 requests per minute per IP to `/contact`.

Turnstile is already live and already stopping this class of bot; the Cloudflare rules stop the traffic ever reaching your origin.

### 4. Watch before you swing at Tehran
Add the visitor's country and IP to the contact submission admin view and, if you want it, a lightweight page-hit log so we can see what that session is actually requesting. If it turns out to be scraping product pages or probing admin routes, we block the ASN at Cloudflare with evidence rather than guessing.

## Technical notes

- Migration: new `public.abuse_ip_blocks` table (cidr, reason, created_by, created_at) with GRANTs, RLS restricted to platform admins, read by the edge function via service role; plus a one-off UPDATE marking the 16 known bot rows as spam.
- `supabase/functions/submit-contact/index.ts`: load the blocklist (cached in memory per isolate, short TTL), compare the resolved client IP with `inet` containment via an RPC, drop silently on match.
- `src/pages/admin/...` contact submissions view: spam filter, IP column, "block IP" action.
- No Cloudflare changes can be made from here — those are steps you apply in the dashboard; I'll write them out exactly.

## What I need from you

Are the `document-centre.com` DNS records in Cloudflare set to **Proxied** (orange cloud) or **DNS only** (grey cloud)? WAF, rate limiting and country rules only work when proxied. If they're grey, step 3 becomes "switch to proxied first" and I'll note the Amplify certificate implications.
