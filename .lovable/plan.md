# 2027 Edition Trade Launch Readiness Plan

## Goal
Send the first trade campaign from The 2027 Edition tenant to ~700 shops and be confident the storefront can accept orders end-to-end.

## Verdict right now
**Not ready.** Two hard blockers would stop the launch cold, and four more items need to be closed before I’d feel comfortable pressing send.

## Hard blockers (must fix before launch)

1. **Critical security finding blocks publishing**
   - Finding `tenants_public_business_pii_exposure` exposes `billing_email`, `support_email`, `support_phone`, `vat_number`, `registration_number` and `legal_name` of active tenants to anonymous users.
   - This is an `error`-level finding and will block publishing until it is fixed or intentionally ignored.
   - Fix: replace the broad public `tenants` SELECT policy with a limited storefront view or column-restricted policy.

2. **Resend broadcast emails are failing with 422**
   - The broadcast sender needs Resend custom contact properties `org_name` and `action_link` pre-created before send time.
   - Also needs a verified sender domain and a Full access Resend API key for the 2027 Edition tenant.
   - Fix: configure the tenant’s Resend account, create the two custom properties, verify the sender domain, then send a test campaign to a small internal list.

3. **Supplier order mirroring is incomplete**
   - Paid 2027 Edition orders are not reliably dropping into Impress Print as supplier orders.
   - The supplier-mirror code reads `product_snapshot.product_family_id` but jobs store it under `product_snapshot.product_family.id`.
   - `recordPayment` does not trigger a mirror, and delivery charges/cost prices are zero on mirrored orders.
   - Fix: align the product family lookup, mirror on payment completion, carry delivery charge and supplier cost price.

4. **Activation page still needs the white logo uploaded**
   - The code now supports a "Logo for dark backgrounds" field, but the white PNG still needs to be uploaded in The 2027 Edition → Settings → Branding.
   - This is a tenant-admin action; the assistant cannot complete it without a signed-in session.

## Medium blockers (fix before launch or accept known risk)

5. **Sample pack is still on for 2027 Edition**
   - The user asked about turning it off. If it stays on, the R495 pack offer will be visible to trade visitors.
   - Action: decide on/off, then toggle in Settings → Sample Pack.

6. **Payments tab is not mounted in tenant Settings**
   - `PaymentsTab` exists but is not reachable from Admin Settings, so PayFast credentials cannot be entered per tenant.
   - Fix: add Payments between Financial and Quotes in `AdminSettings.tsx`, guarded for owners/admins.

7. **Impersonation edge error for cross-tenant staff**
   - Staff who are branch managers in one tenant but customers in another are blocked from impersonation because the staff check is global.
   - Fix: scope the staff block to the tenant being impersonated and surface the real error in the UI.

8. **Trade-customer flag can revert for existing customers**
   - Duplicate active memberships can cause the trade flag to flip back off.
   - Fix: enforce the tenant-wide trade resolution and repair the affected records.

## Test plan (do not skip)

- **Email test**: send the campaign to 5 internal test addresses first; verify sender, branding, activation link, unsubscribe and that it does not 422.
- **Activation test**: open the activation link on mobile and desktop; confirm the white logo shows, the form works, and sign-in succeeds.
- **Order test**: place a test order as a trade customer, go through checkout, pay, and confirm the order appears in Impress Print with the correct spec, artwork and delivery charge.
- **Dispatch test**: mark the supplier order as dispatched with a waybill; confirm the 2027 Edition order updates and the customer dispatch email sends.
- **Mobile test**: walk the shop page, product page, upload flow and checkout on a phone.

## Go / no-go criteria

- [ ] Security scan is clean or the PII finding is intentionally ignored.
- [ ] Test campaign sends successfully to internal addresses.
- [ ] White logo is uploaded and the activation page looks right.
- [ ] A test order flows from 2027 Edition into Impress Print and back with dispatch details.
- [ ] Sample pack decision is made and applied.
- [ ] Payments tab is reachable so PayFast settings can be maintained.

## Out of scope for this launch

- Inter-tenant invoicing between 2027 Edition and Impress Print.
- Suppliers outside the app.
- New product families beyond the existing calendar/deskpad/planner outsource flow.
