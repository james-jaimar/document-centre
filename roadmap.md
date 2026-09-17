
## Invoice / pro forma documents (2026-09-03)
- [x] Customer VAT + account number on the invoice metadata strip (currently the seller's)
- [x] Editable pro forma / invoice Terms & Conditions in Tenant Settings > Documents
- [x] Re-render stored PDF when document settings (terms/footer/titles) change, not only totals

## Tenant Communications (2026-09-07)
- [ ] Tenant-scoped templates, campaigns, triggers, history (owner/admin only)
- [ ] Audience: business accounts + individual customers
- [ ] Per-campaign link type: activation page or one-time sign-in
- [ ] Send from tenant's own email account
- [ ] Unsubscribe handling: token link, suppression list, send-time filtering

## Resend for tenant email (2026-09-07)
- [x] Resend mailbox per tenant (own API key in vault, domain verification check)
- [x] Mail worker sends via Resend when the tenant's mailbox uses it
- [x] Campaigns send as Resend broadcasts with hosted unsubscribe
- [x] Webhook folds opens/clicks/bounces/complaints/unsubscribes into history + suppression
- [ ] Live run: verify domain in Resend, connect Impress Print, test send, dry run, small broadcast

## The 2027 Edition second campaign (2026-09-17)
- [ ] Finalise the advanced email template and remove the unresolved custom pixel
- [ ] Add a previous-campaign recipient audience with suppression reapplied
- [ ] Preserve safe campaign attribution across storefront navigation and activation completion
- [ ] Prepare the eligible follow-up campaign without sending
