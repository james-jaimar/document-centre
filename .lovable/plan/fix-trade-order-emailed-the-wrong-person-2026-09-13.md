# Fix: trade order emailed the wrong person

## What the records actually show

For order 27EDIT-13002 three emails were queued and all three were sent successfully:

| Sent | From | To | Subject |
|---|---|---|---|
| 16:18:43 | hello@the2027edition.com | james_b_hawkins@me.com | Order 27EDIT-13002 received — thank you! |
| 16:18:57 | online@impressweb.co.za | james_b_hawkins@me.com | Order CAL-26002 received — thank you! |
| 16:19:01 | hello@the2027edition.com | james_b_hawkins@me.com | Payment received for order 27EDIT-13002 |

So two things are true:

1. **The 2027 Edition email did go out**, from hello@the2027edition.com to james_b_hawkins@me.com, and the mail server accepted it. Nothing in the system failed. If it didn't land, that's a delivery/spam issue at the mailbox end, not a missing email — worth checking the junk folder before we treat it as a bug.
2. **The Impress Print email went to the wrong person.** It should have gone to The 2027 Edition as the trade customer, not to the end customer.

## Why the trade email went to the end customer

When the order is copied into Impress Print, it carries the end customer's email straight across onto the new order. The order confirmation then simply emails whoever is named on the order — so the end customer received an Impress Print "thanks for your order" message, which breaks the white label completely.

The right recipient already exists: the trade partner link points at the company record "The 2027 Edition" inside Impress Print, and its contact login is hello@the2027edition.com. The copy step just doesn't use it.

## The fix

- On the trade order, set the contact to the buyer company: the company's own email address if one is recorded, otherwise its main contact login (here, hello@the2027edition.com). The end customer's address is never copied onto a trade order.
- If neither address can be found, don't guess and don't fall back to the end customer — create the trade order without a recipient, skip the email, and leave a note on the order so staff can see the contact is missing.
- Fill in the missing email on The 2027 Edition company record in Impress Print so the account is complete either way.
- Correct the existing CAL-26002 record so it shows The 2027 Edition rather than the end customer.

## Technical notes

- `supabase/functions/_shared/supplier-mirror.ts`: the insert at the `customer_email: order.customer_email` line becomes the buyer contact. The block that loads `customer_companies` for `link.buyer_company_id` already selects `email`, and already resolves the primary contact membership — extend it to also read that profile's `email` and use `company.email ?? contactProfile.email ?? null`.
- `supabase/functions/send-order-email/index.ts` already skips when `customer_email` is null (`reason: "no_email"`), so a missing contact degrades safely; add the admin-visibility `timeline_events` note in the mirror when that happens.
- Data fixes: `customer_companies.email` for `b939ed14-8cc6-478e-bd45-c5719b12afee`, and `orders.customer_email` for `636c3bbf-91be-4e8c-81ae-a39518db11ed`.
- Not changing anything about the 2027 Edition's own customer emails — those are working.
