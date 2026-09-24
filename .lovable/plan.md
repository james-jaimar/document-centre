# Contact form test: why no email arrived

## What happened (confirmed from the saved enquiry)

Your test was received and saved at 06:59 UTC today, but the message was `fsdgsgsdfgdfgd` — one long string with no spaces. The anti-bot filter we added in August scores "message with no spaces" as spam (the bots were sending exactly that), so the enquiry was stored as **Spam** and, by design, no emails were sent (no team notification, no auto-reply). That rule is what stopped the bounce-back flood.

You can see it in Platform admin → Enquiries → **Spam** tab. Email sending itself is not broken — a normal sentence (like your 6 August test) goes through.

## Suggested small fix

The thank-you screen currently says "We've sent a confirmation to …" even when nothing was sent, which is misleading. Change it to neutral wording: "Thanks — we've got your message and someone will be in touch shortly." We keep showing success to spam (so bots learn nothing), but it no longer promises an email.

Optionally, soften the rule so a no-spaces message only counts as spam when combined with another signal (e.g. random-looking name, very fast submit). Recommended to leave it as-is, since it's the rule catching most bots.

## To re-test

Submit the form with a real sentence; you should get the auto-reply and hello@ should get the notification.

## Technical notes

- `src/pages/Contact.tsx`: success-state copy only.
- Optional: `supabase/functions/_shared/contact-spam.ts` line 75, lower `message_no_spaces` from 3 to 2.
