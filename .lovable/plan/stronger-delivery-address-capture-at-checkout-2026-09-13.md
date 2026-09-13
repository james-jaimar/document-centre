# Stronger delivery address capture at checkout

Today a customer can pick only a province and still reach "Place Order & Pay". The delivery address block needs proper required fields, inline errors and the same checks applied again when the order is saved.

## What the customer will see

Required for delivery:
- Contact name **or** company (at least one — we must know who to deliver to)
- Address line 1
- City
- Province
- Postal code (4 digits for South Africa)
- Phone
- Email (pre-filled with the signed-in person's email, editable)

Behaviour, Shopify-style:
- Required fields marked with an asterisk.
- No error shouting while typing: a field is validated when the customer leaves it, and everything is validated when they press Place Order.
- Failed fields get a red outline and a short message underneath ("Enter a city", "Enter a valid 4-digit postal code", "Enter a contact name or company").
- Pressing Place Order with anything missing scrolls to the first problem field and focuses it, instead of a single vague toast.
- Light tidying on save: trim spaces, capitalise the town/city sensibly, strip spaces from the postal code, normalise the phone number.
- A saved address chosen from the picker is validated the same way, so an incomplete stored address can't slip through.
- The same rules apply to the billing address when it is required.

## Also covered

- The delivery price already needs city/postal/province; once those are mandatory the "Enter address for delivery pricing" state clears sooner and the total is right before payment.
- Saved addresses created from the address dialog get the same required checks, so future checkouts start clean.

## Technical notes

- New `src/lib/validation/addressSchema.ts`: a zod schema for a delivery/billing address with the "name or company" refinement, per-country postal rules (ZA `^\d{4}$`, otherwise 3–10 alphanumeric), email and phone checks, plus a `normalizeAddress()` helper.
- `Checkout.tsx`: replace the single `!address.line1.trim()` guard with schema validation for both delivery and billing; hold `errors` and `touched` state, render inline messages, focus the first invalid input via refs, and default `address.email` from `user.email` when empty.
- `CustomerAddressDialog.tsx` uses the same schema so saved addresses are complete.
- Server-side: `order-engine` rejects a delivery submission whose address fails the same field checks, so the browser isn't the only gate.
