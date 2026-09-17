# Prepare the second 2027 Edition email campaign safely

## What I verified

- The tenant-owned advanced template **“2nd email”** already exists with the supplied subject and complete HTML.
- Its logo and all four product photographs already use public HTTPS email-image URLs; no separate logo file is still needed.
- The three supplied shop URLs resolve successfully, including the intentionally spelled `/main/shop/monhlyplanners`, and all three products are enabled for The 2027 Edition.
- The template contains the correct `{{activation_link}}`, `{{sender_postal_address}}` and `{{unsubscribe_url}}` fields. Resend already converts the unsubscribe field to its hosted unsubscribe token.
- The template also contains `{{tracking_pixel_url}}`, but the Resend broadcast path does not resolve that field. Sending it now would leave a broken image. The app already receives Resend bounce events and supports Resend open/click events, so a second custom pixel would be unnecessary and could double-count opens.
- The first full campaign has 702 recipient rows: 649 successfully added for sending and 53 failures (52 recorded bounces and one invalid address). After current unsubscribe/suppression checks, **647 recipients are eligible** for this follow-up.
- The current app records `sent` before the Resend broadcast is delivered and has no separate delivered timestamp. Therefore, the safe audience is the first campaign’s successful, currently unsuppressed recipients—not a claim of delivery that the stored data cannot prove.
- Website page views include the full landing URL, so the initial UTM values reach Google Analytics. They are not currently retained after visitors navigate to another page.

## What I will change

### 1. Finish and validate the email template

- Save the supplied preheader in the template’s preheader field as well as keeping the hidden email preheader.
- Remove the complete custom tracking-pixel element containing `{{tracking_pixel_url}}`.
- Keep the existing public logo/product image URLs and all authored UTM parameters unchanged.
- Keep activation links free of UTM parameters.
- Generate and save the plain-text fallback from the final HTML.
- Run the existing template checks and verify no unresolved application placeholders or relative images remain.

### 2. Add a safe follow-up audience

- Add a **Previous campaign recipients** choice to the tenant campaign composer.
- Let the tenant choose the first campaign and load only its successful recipient records.
- Reapply the current unsubscribe, complaint and bounce suppression rules when preparing the follow-up.
- Do not exclude activated contacts, as requested.
- Show the resulting count before preparation; for the current data this should be 647 unless suppression data changes.
- Keep the 53 failed/bounced recipients out of the draft.

### 3. Preserve campaign attribution on the storefront

- Capture only the approved campaign UTM fields when someone first lands on a public shop page.
- Retain that attribution during same-site navigation and include it in subsequent Google Analytics page views without rewriting every visible URL.
- Record a separate activation-completed analytics event using campaign attribution only; never include the personal activation token or activation URL in analytics.
- Keep email clicks and approximate opens in the existing Resend event flow, avoiding duplicate custom-pixel tracking.

### 4. Prepare, but do not send

- Create the second campaign in a prepared state for the eligible follow-up audience.
- Generate/reuse each recipient’s existing-company activation invitation during preparation.
- Stop before contact synchronisation or broadcast creation, so no recipient receives an email.
- Leave the campaign visible in Communications with its recipient count and the existing **Send prepared campaign** action for a later deliberate send.

### 5. Verification

- Check desktop and mobile previews.
- Confirm every logo and product image loads.
- Confirm all four public browse links resolve and retain their authored UTM parameters.
- Confirm the personalised activation link reaches the correct company and trade pricing after sign-in, without exposing its token to analytics.
- Confirm the Resend unsubscribe token survives final rendering.
- Confirm no unresolved placeholders remain.
- Do **not** send a test or live campaign during this work.

## Technical notes

- Extend the existing campaign audience resolver and tenant Communications screen rather than creating a separate campaign tool.
- Identify previous-campaign recipients by campaign and stored recipient identity/email, then run the existing suppression lookup again at prepare time.
- Add minimal storefront attribution handling around the existing GA page-view hook and activation completion point.
- No new email provider, custom tracking pixel, or change to the shared Resend “General” segment workflow.
