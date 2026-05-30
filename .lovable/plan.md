# Fixes — QR modal, email logo, VAT

## 1. QR upload modal not coping with many photos

`src/components/order/QRUploadModal.tsx` caps the preview at 12 thumbs (then "+13 more") and uses a fixed 4-column grid — fine for 4 photos, cramped at 25+.

Changes:
- Replace the 12-cap with a scrollable thumb area (`max-h-48 overflow-y-auto`) so all received files are visible.
- Bump grid to `grid-cols-6` on the modal width and shrink tiles to `h-12` so 25+ photos fit without dominating the dialog.
- Add a sticky count header inside the scroll area: "25 files received".
- When >12 files arrive, collapse the QR block (`size={140}`) so the receiving list gets priority — most users have already scanned by then.

## 2. Email logo: exposed Supabase URL + still too big

`supabase/functions/send-order-email/index.ts` currently renders the tenant logo as `<img src="https://lcvdhtaqoumyokjqaqfw.supabase.co/storage/v1/object/public/tenant-asset/...">`. Outlook's preview pane exposes the full src, which leaks the Supabase host and looks unprofessional. Width is also unconstrained in clients that ignore `max-width` on `<img>`.

Changes:
- **Inline the logo as a CID attachment.** No URL appears in the email at all.
  - In `send-order-email`: fetch the logo bytes from storage (server-side), pass as an attachment with `content_id: "tenant-logo"` and `inline: true`, render as `<img src="cid:tenant-logo">`.
  - Extend `_shared/email-queue.ts` `AttachmentSpec` with optional `content_id` + `inline` fields.
  - Extend `email-dispatcher/index.ts` to emit inline attachments as `multipart/related` parts with the matching `Content-ID` header (currently only emits `Content-Disposition: attachment`).
- **Hard-cap the rendered size.** Add explicit `width="140"` HTML attribute (Outlook ignores CSS max-width) alongside `style="max-width:140px;height:auto"` so the logo stays a proper letterhead mark, not a billboard.
- SVG logos: rasterise to PNG via the existing PDF API before attaching (it already exposes raster helpers), or fall back to the text portal name as today.

## 3. VAT not applied despite tenant setting

Root cause: `src/hooks/useCart.ts` line 673-675 hard-codes `vatAmount = 0` with a "Demo mode" comment. The tenant Financial tab settings (`tax_rate`, `tax_inclusive`) are never read at checkout. Order-engine and order pricing tab support VAT, but the cart never sends a non-zero value.

Changes:
- Read tenant financial settings in `useCart.placeOrder`:
  - `tax_rate` (default 15)
  - `tax_inclusive` (default false)
  - new `tax_enabled` boolean (default true if `tax_rate > 0`)
- Compute VAT correctly:
  - inclusive: `vat = subtotal - subtotal / (1 + rate/100)`
  - exclusive: `vat = subtotal * rate/100`, added to total
- Add a **branch-level override** so individual PostNet stores can disable/adjust VAT independently of the tenant default:
  - New `branch_settings` rows: `tax_enabled`, `tax_rate`, `tax_inclusive` (all nullable; null = inherit tenant).
  - Resolve via a small helper `resolveBranchTax(tenantId, branchId)` that merges tenant → branch.
  - Add a "Tax / VAT" card to `BranchSettings.tsx` with the three controls and an "Inherit from tenant" toggle per field.
- Update `CustomerOrderDetail.tsx` and the cart summary to show the VAT line only when `vat_amount > 0` (existing guard already does this).

## Technical details

**Files touched**
- `src/components/order/QRUploadModal.tsx` — layout only.
- `supabase/functions/send-order-email/index.ts` — fetch logo bytes, emit CID, shrink.
- `supabase/functions/_shared/email-queue.ts` — `AttachmentSpec` adds `content_id?`, `inline?`.
- `supabase/functions/email-dispatcher/index.ts` — `multipart/related` for inline attachments, set `Content-ID` header.
- `src/hooks/useCart.ts` — replace hard-coded `vatAmount = 0` with resolver.
- `src/lib/tax/resolveBranchTax.ts` — new helper.
- `src/pages/branch/BranchSettings.tsx` — new VAT card.
- Migration: add `tax_enabled`, `tax_rate`, `tax_inclusive` keys to `branch_settings` (no schema change — JSONB).

**Out of scope (this turn)**
- PostNet branding of the branch admin portal (already deferred).
- Migrating the logo to a vanity `postnetprintcentre.com/...` URL (would require Amplify rewrites or a tenant CDN). CID embedding solves the "exposed URL" complaint without infra work.
