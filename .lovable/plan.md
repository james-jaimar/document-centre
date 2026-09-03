# Require a billing address at checkout

Customers must supply a complete billing address before they can place their first order, so every invoice has proper billing details. Off by default; switched on per tenant (starting with Impress Print).

## How it works for the customer

- At checkout a **Billing address** block appears above the payment section.
- If they already have a saved billing address, it is pre-selected (default, or the only one) and shown as a summary with a "Change" option — no extra typing on repeat orders.
- If they have none, they fill in the fields inline. On placing the order it is saved to their address book as their default billing address, so it is only ever entered once.
- When delivery is selected, a "Same as delivery address" checkbox copies the delivery details across.
- Place Order is blocked with a clear message until the required fields are complete: contact name, address line 1, city, postal code, country, and either phone or email. Company name is optional (filled if they are a company account).
- When the setting is off, nothing changes for that tenant.

## Admin control

New toggle in Admin → Settings → Financial: **"Require billing address at checkout"** (default off), with a short explanation that customers will be asked for billing details before their first order can be placed. Enabled for Impress Print.

## What gets stored

- The billing address is written to the order (the `billing` address record already supported by the order engine), so invoices and the admin Delivery/Billing tab show it.
- A copy is saved to the customer's address book as `billing` type so it auto-fills next time.

## Technical notes

- Setting: `tenant_settings` `category = "financial"`, `setting_key = "require_billing_address"`, boolean. Read on the storefront via the existing `resolve_tenant_setting` RPC path (anonymous/customer users cannot read `tenant_settings` directly), following the pattern in `useWeightSettings.ts`. Written from `FinancialTab.tsx` with `useBulkUpsertTenantSettings`.
- New `useRequireBillingAddress()` hook returning the resolved boolean.
- `Checkout.tsx`: add billing state + `AddressPicker addressType="billing"`, "same as delivery" copy, validation in `handlePlaceOrder`, and pass a new `billingAddress` field to `usePlaceOrder`.
- `useCart.ts` `usePlaceOrder`: accept `billingAddress` and forward it as `billing_address` in the `createOrder` payload — the order-engine already inserts a `billing` row into `order_addresses` when that field is present, so no edge-function or schema change is needed.
- Address book save reuses `useCustomerAddresses().create` with `address_type: "billing"`, `is_default: true` when it is their first billing address.
- No migration required.

## Out of scope

- Forcing address capture before starting an order or at sign-up.
- VAT/company registration number fields (can be added later if invoices need them).
