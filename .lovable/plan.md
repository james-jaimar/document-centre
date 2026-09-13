# Restore the missing Payments settings tab

## What's wrong

The Payments settings screen exists and is fully built (gateway switches for PayFast and Stripe, credential entry, banking details, payment instructions, branch readiness list), but it is not linked into the tenant Settings page. The tenant Settings tab strip lists General, Branding, Workflow, Financial, Quotes, Uploads, Photo Library, Notifications, Email Accounts, Documents, Delivery, Legal, Domains and Billing — no Payments. So there is no way to reach it from any tenant, which is why you can't find where to enter PayFast details.

Branch-level payment entry does exist today: it shows on a branch's own settings page and on the branch detail page inside the tenant admin area. Tenant-level entry has no route at all.

## The fix

Add Payments back into the tenant Settings tab strip, between Financial and Quotes, showing the existing screen unchanged:

- Gateway on/off switches for PayFast and Stripe (only providers the platform has permitted for that tenant)
- Credential entry (PayFast merchant ID, merchant key, passphrase; test or live mode)
- Branch payment readiness overview
- EFT / bank transfer and pro forma toggles, banking details, payment instructions

Restrict the tab to tenant owners and admins (and platform admins working inside a tenant), matching how Billing is handled.

## Technical detail

`src/pages/admin/AdminSettings.tsx` never imports or renders `src/pages/admin/settings/PaymentsTab.tsx`. Add the import, a `{ value: "payments", label: "Payments", icon: Wallet }` entry in the tab array guarded by `isOwnerOrAdmin`, and the matching `<TabsContent value="payments"><PaymentsTab /></TabsContent>`. No other files change; no database or backend work is needed.

## Verify

Open a tenant's Settings, confirm Payments appears, switch PayFast on, save credentials, and confirm the "Credentials saved" badge appears and the branch readiness card reflects it.
