## What we know (verified)

The queue is doing the right thing. Looking at `email_outbox` for branch Demo 2:

- 2 rows for `admin@jaimar.dev → jimmybhawkins@gmail.com` from ~17:00 and 17:02 today, both `status=sent`, `provider=smtp`, no error.
- `email_account` `5f82982e…` is SMTP to `mail.jaimar.dev:465`, `smtp_secure=tls` (implicit SSL — correct for 465).

So the Cloud Run worker connected, authenticated, and the mail server at `mail.jaimar.dev` (154.0.160.190, a shared aserv/ucebox host) accepted the message. That is what "sent" in our UI means — provider ACK, not Gmail-inbox confirmation.

Nothing after that point is inside our code. But before we assert a cause, DNS lookups on `jaimar.dev` show strong signals worth verifying:

```
TXT  jaimar.dev         v=spf1 include:ucebox.co.za +a +mx -all
TXT  _dmarc.jaimar.dev  v=DMARC1; p=quarantine; aspf=s; adkim=s; ...
MX   jaimar.dev         mx6979365921.spe.ucebox.co.za  (aserv pool)
A    jaimar.dev         185.158.133.1         (web host, not mail)
A    mail.jaimar.dev    154.0.160.190         (aserv shared host)
TXT  default/dc/google._domainkey.jaimar.dev  (none published)
```

Two things stand out and need confirming, not assuming:

1. **SPF may not authorise the sending IP.** `+a` resolves to the web host, not `mail.jaimar.dev`. The IP 154.0.160.190 has to be covered by `include:ucebox.co.za → include:spf.aserv.co.za` or by `+mx` (aserv pool). If it isn't, SPF = fail.
2. **No DKIM selectors visible for jaimar.dev.** If aserv signs with their own `d=aserv.co.za`, DKIM does not align with the `From: admin@jaimar.dev` header.
3. **DMARC is `p=quarantine` with strict alignment on both SPF and DKIM.** With no DKIM alignment and possibly no SPF alignment, Gmail is entitled to quarantine — and with strict alignment + low sender reputation Gmail sometimes drops silently rather than filing to Spam.

This matches the symptom ("nowhere, not even Spam") but I want to confirm before we act.

## Plan

### Step 1 — Confirm the cause, don't assume it (chat only, no code)

1. Send one test from the Demo 2 branch to `check-auth@verifier.port25.com` (or `test-xxxxx@mail-tester.com`). The reply / mail-tester report tells us exactly:
   - the sending IP the receiver saw,
   - SPF pass/fail and alignment,
   - DKIM pass/fail and the `d=` domain used,
   - DMARC disposition.
2. Also send one to a second personal Gmail (or a Yahoo/Outlook) address — if it lands in Spam there, it confirms deliverability, not our queue.
3. Ask the user to check the aserv/ucebox webmail "Sent" folder and any bounce/DSN there — that tells us whether aserv accepted-and-relayed or accepted-and-dropped.

We do nothing else until Step 1 tells us which of SPF, DKIM, DMARC (or an aserv-side issue) is actually failing.

### Step 2 — Fix the specific failure Step 1 identified

Likely one or more of:

- **Publish DKIM for jaimar.dev.** Ask aserv/ucebox for the DKIM selector + public key TXT record for `<selector>._domainkey.jaimar.dev` and add it at the DNS host. This is almost always the missing piece for aserv-hosted mail.
- **Fix SPF** so it explicitly covers the actual sending host, e.g. `v=spf1 include:spf.aserv.co.za include:ucebox.co.za -all` (drop `+a`, keep or drop `+mx`) — the exact include comes from what aserv publishes.
- **Relax DMARC alignment temporarily** to `aspf=r; adkim=r` (relaxed) while diagnosing, then re-tighten once SPF+DKIM are clean.

None of these are code changes — they're DNS records on `jaimar.dev`.

### Step 3 — Product improvement so this is visible in-app (small code change, after Step 2)

Today the UI shows "Sent" the moment the SMTP server ACKs. That's misleading whenever downstream delivery fails silently. Add:

1. A **"Send a diagnostic test"** button on the branch email settings page for the active account. It calls the existing `send-test-email` edge function targeting `check-auth@verifier.port25.com` and shows the returned auth report inline (or a link to Postmaster Tools).
2. A one-liner tooltip on the "Sent" status in `BranchSentMail` clarifying "The mail server accepted the message. Delivery to the recipient's inbox depends on SPF/DKIM/DMARC on your sending domain."

These are additive, presentation-only changes and don't touch the send pipeline.

## Technical notes

- `email_outbox.status='sent'` is set in `pdf-server/app/tasks/email_tasks.py::send_email` after `send_smtp` returns without raising. `send_smtp` only sees SMTP-level errors from `aiosmtplib` (4xx/5xx or connect/timeout). A silently-dropped-downstream message never raises here, which is why we mark it sent.
- If Step 1 shows the mail leaves aserv correctly, we'd next need aserv's outbound relay log (only they can pull it) to see if Gmail 250-accepted or rejected with a 5xx.
- No migrations required for Steps 1 and 2. Step 3 is UI-only in `src/pages/branch/BranchSentMail.tsx` and the branch email settings tab.
