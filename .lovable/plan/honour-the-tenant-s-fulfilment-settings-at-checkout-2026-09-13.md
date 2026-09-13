# Honour the tenant's fulfilment settings at checkout

## What's happening

The 2027 Edition has Courier ticked only — Collection is off (confirmed in the tenant's saved delivery settings). But the checkout page ignores that setting entirely: it always shows both "Collection — Pick up from our branch" and "Delivery — Ship to your address", and it starts with Collection pre-selected. The branch-level "Collection Available" switch is saved too but likewise never read anywhere.

So the setting exists and you set it correctly — nothing is reading it.

## The fix

1. Checkout reads the tenant's enabled fulfilment methods (and the branch's Collection Available switch where a branch is active).
   - Collection appears only when collection is enabled at tenant level and not switched off for the active branch.
   - Delivery/shipping appears only when courier, local delivery or postal is enabled.
2. The starting selection becomes the first method that is actually allowed, instead of always Collection. With only Courier enabled, the customer lands straight on delivery.
3. When only one method is allowed, show it as a simple confirmed line rather than a radio choice with one option.
4. If no method is enabled, show a clear message that this store isn't accepting orders online yet, instead of a broken empty choice.
5. Apply the same rule to the customer "Switch to collection / delivery" action on an existing order, so a disabled method can't be picked there either.
6. Enforce it server-side when an order is placed, so a disallowed fulfilment type is rejected rather than trusted from the browser.

## Technical detail

- Setting lives at `tenant_settings` category `delivery`, key `methods_enabled` (currently `["courier"]`); resolve it via the `resolve_tenant_setting` RPC as Checkout already does for `allow_prepaid_invoice`. Branch override: `branch_settings` `collection_available`.
- `src/pages/dashboard/Checkout.tsx` hardcodes the radio group (lines ~633-650) and initialises `deliveryMethod` to `"collection"` — replace with a derived allowed-methods list driving both.
- `src/components/customer/ManageOrderPanel.tsx` offers the opposite method unconditionally; gate it on the same list.
- `supabase/functions/order-engine/index.ts` validates the fulfilment type against the tenant setting on submit.
- Admin-side manual fulfilment changes in `OrderPricingTab.tsx` stay unrestricted — staff can still override.

## Verify

On The 2027 Edition storefront, check out and confirm only delivery is offered with courier rates applied; tick Collection back on in Tenant Settings → Delivery and confirm both options reappear.
