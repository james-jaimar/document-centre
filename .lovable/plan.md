# Stop the contact-form bot spam (and the bounce-backs)

## What is actually happening

Confirmed from the live data, not a guess:

- Your contact form (`/contact` → `submit-contact`) is being hit by a spam bot. The last 25 submissions are all machine-generated: random-letter names and subjects, 10-digit numbers as the "message", fake `Xyzabc LLC` companies, and real-looking but **harvested/forged** email addresses (aol, comcast, yahoo, gmail addresses that don't belong to the sender).
- The source IPs are Tor exit nodes and bulletproof hosts (185.220.101.x, 171.25.193.78, 109.70.100.8, 45.84.107.x), all with an identical spoofed Mac Safari user-agent.
- **Yes — we do send an auto-reply.** The function sends two emails per submission: an internal notification to hello@document-centre.com, and a branded "Thanks for contacting Document Centre" auto-reply to whatever address was typed in the form. Because those addresses are fake or unwilling third parties, the auto-replies bounce, and the bounce (`Undeliverable: Thanks for contacting Document Centre`) lands in your inbox.

So the "undeliverable" emails are our own auto-replies coming back. Worse, we're currently emailing innocent third parties on behalf of a spammer, which will damage the sending reputation of document-centre.com if left running.

There are currently **no** protections on the form: no honeypot, no captcha, no rate limit, no content filtering.

## The fix

### 1. Stop the backscatter immediately (highest priority)
Only send the visitor auto-reply once the submission passes the spam checks below. Anything scored as spam gets stored (flagged) or dropped, and no email is sent to the typed address. This alone stops the bounce-backs and protects the domain reputation.

### 2. Honeypot + timing trap (invisible, no user friction)
- Add a hidden field to the form that real users never fill; bots almost always do. Any submission with it filled is silently accepted (returns success) but discarded.
- Record when the form was rendered; a submission completed in under ~3 seconds is a bot.

### 3. Cloudflare Turnstile (invisible captcha)
Add Turnstile to the contact form and verify the token server-side in `submit-contact`. It's free, privacy-friendly, and invisible for genuine visitors. This is the real wall — honeypots alone get beaten eventually. Requires a Turnstile site key + secret key from your Cloudflare account (you already use Cloudflare for DNS).

### 4. Server-side rate limiting and content heuristics
- Cap submissions per IP (e.g. 3/hour, 10/day) and per email address, using the existing `contact_submissions` table.
- Score obvious spam patterns already visible in your data: message that is only digits, no spaces in the message, subject with no dictionary-like words, random-consonant names, links in a short message. Flagged rows are saved with `status = 'spam'` so nothing is lost and you can review.

### 5. Clean up and visibility
- Bulk-mark the existing bot rows as spam so the admin list is usable.
- Add a "Spam" filter to the contact submissions admin view so you can eyeball what's being blocked.

## Technical notes

- `supabase/functions/submit-contact/index.ts`: reorder to validate → spam-score → insert → only then enqueue emails; internal notification only for non-spam (or a daily digest of spam counts instead).
- Migration: add `spam_score numeric`, `spam_reasons text[]`, and an index on `(ip_address, created_at)` to `contact_submissions`; extend the `status` values with `spam`.
- `src/pages/Contact.tsx`: hidden honeypot input, render timestamp, Turnstile widget, pass `turnstile_token` in the request body.
- Turnstile secret stored as an edge function secret (`TURNSTILE_SECRET_KEY`); the site key is publishable and can live in code.

## What I need from you

To wire up Turnstile I'll need a Cloudflare Turnstile site key and secret key (Cloudflare dashboard → Turnstile → Add site → domain `document-centre.com`). If you'd rather not use Turnstile yet, I can ship steps 1, 2, 4 and 5 first — that will stop the bounce-backs today — and add Turnstile after.
