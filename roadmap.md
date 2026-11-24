## Perfect bound books (2026-11-23)
- [x] Set the admin-owned perfect-binding charge to 7.50 per book (printing, paper and lamination excluded)
- [x] Admin min/max body page setting per product (40-page default for perfect bound); block add-to-cart outside limits
- [x] Perfect Bound product preset in the catalogue; existing family options seeded without changing page limits
- [x] Consistent perfect-bound detection including perf-bound and binding metadata
- [x] Body-only Files step with automatic assignment, body-page counting and configurable limits
- [x] Cover Studio guided path: front + back upload, spine colour, spine title/author
- [x] Cover Studio pro path: wrap size guidance, downloadable cover template, single wrap upload
- [x] Implement separate vector cover-wrap production output; four compositor tests passed
- [x] Desktop/mobile 3D cover controls checked; 37 frontend/helper tests and four edge-function tests passed
- [ ] Configure full-wrap printing + cover-stock prices and enable chosen sizes/stocks; blocked on print-shop pricing choices
- [ ] Verify deployed Cloud Run wrap output and enable perfect-bound production; blocked on external GitHub/Cloud Run deployment
- [ ] Verify real signed-in upload → cover → cart → placed order → production PDFs; external unmanaged authentication prevents a session here

## Architectural bookshelf (2026-11-23)
- [x] Group saved products into product-category shelves with upright covers and subtle shelf rails
- [x] Add enabled-only customer header/account/dashboard links and a direct link after saving
- [x] Verify desktop/mobile shelf browsing, thumbnail display, search, category filtering and review navigation using isolated fixtures; 17 regression tests passed
- [ ] Verify the real signed-in customer's shelf and restored order end-to-end; blocked by external unmanaged authentication

## Optional customer bookshelf (2026-11-22)
- [x] Add a disabled-by-default per-tenant switch; confirmed zero tenants enabled
- [x] Save configured PDF products and independent thumbnails to a private named bookshelf with SKU and retained revisions
- [x] Browse, rename, remove, and restore copies for current-price review or artwork revision using existing order flows
- [x] Verify safeguards: 19 frontend/helper tests and four order-engine tests passed; preview builds clean; order-engine deployed
- [ ] Signed-in save → revise → review → cart verification blocked by external unmanaged Supabase authentication


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
- [x] Finalise the advanced email template and remove the unresolved custom pixel
- [x] Add a previous-campaign recipient audience with suppression reapplied
- [x] Preserve safe campaign attribution across storefront navigation and activation completion
- [x] Prepare the eligible follow-up campaign without sending

## Original-density watermarks (2026-10-22)
- [x] Add opt-in original-density checkbox and production-review note
- [x] Preserve the choice in saved artwork and flag it in the admin proof
- [x] Verify density rules and checkbox behaviour (8 tests passed; authenticated tenant end-to-end check unavailable)

## Cart-edit artwork storage (2026-10-26)
- [x] Remap uploaded, template, photo and canvas artwork to cloned documents; stop edits on failed copies or saves
- [x] Include template uploads in Customer Files with original file extensions
- [x] Run regression tests (18 passed) and confirm preview build; authenticated live checks unavailable with external unmanaged Supabase

## Invoice send tracking (2026-10-27)
- [x] Record confirmed invoice/pro forma sends in the order timeline; rolled-back database regression passed
- [x] Show send state, last recipient/time and resend control on document icons
- [x] Twelve invoice/payment tests passed; deployed function rejects invalid input without sending mail; package download issue resolved
- [ ] Authenticated customer-send UI verification unavailable with external unmanaged Supabase

## Finishing, tickets and placed-order artwork (2026-10-29)
- [x] Preserve custom finishing selections in new snapshots and show legacy selections in job details
- [x] Include finishing, PO, company and schedule details in job-ticket renderer; three Python tests passed
- [x] Add controlled customer/staff artwork updates with retained originals, timeline audit and stale-output invalidation; seven frontend and two Deno tests passed
- [x] Preview builds clean and sign-in page loads without runtime errors
- [ ] Live customer/staff revision verification blocked by external unmanaged authentication; photo/canvas layout replacement not supported
- [ ] Regenerate CAL-26023 ticket after Cloud Run deployment; deployed renderer and GitHub/Amplify sync not verifiable here
