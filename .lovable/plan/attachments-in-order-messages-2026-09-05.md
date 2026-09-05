# Attachments in order messages

Let customers (and staff) attach files — proof of payment, screenshots, small artwork — to a message on an order. Files live in S3, not in the database. Only people who are already allowed to see that order can see its attachments.

## What the user sees

**Customer, on an order page (Messages panel)**
- A paperclip button next to the message box.
- Pick one or more files (or drag them onto the box). Each shows name, size and a remove "x" while it uploads, with a small progress bar.
- Send works with text, files, or both. If only files are attached, the message body is filled in automatically ("Sent 2 attachments").
- Sent messages show their files as compact chips under the message bubble. Images show a thumbnail; clicking any chip downloads/opens it.

**Staff, in the tenant and branch order detail Timeline panel**
- Same paperclip + chips, so staff can send back a stamped invoice or a proof image.
- Staff attachments on internal notes stay internal (customers never see them).

**Limits and messaging**
- Max 50 MB per file, max 5 files per message.
- Allowed: PDF, JPG, PNG, WEBP, HEIC, GIF, plus Word/Excel/PowerPoint and CSV/TXT.
- Over the limit: a clear inline note — "That file is 78 MB. The chat limit is 50 MB — please send large files by WeTransfer and paste the link here."
- Wrong type: "That file type isn't allowed here."

## Technical section

**Storage**
S3 via the existing `s3-storage` edge function and `src/lib/s3Storage.ts` (`getUploadUrl` + `uploadToS3`). Key layout mirrors the existing uploads convention and is tenant/branch/order scoped:

```text
tenants/{tenant_id}/branches/{branch_id|_}/messages/{order_id}/{uuid}_{safe_name}
```

**New table `public.message_attachments`** (metadata only, no bytes)
- `message_id` → `messages(id) on delete cascade`, `app_id`, `tenant_id`, `branch_id`, `order_id`
- `file_name`, `file_path`, `file_size`, `mime_type`, `uploaded_by`, `created_at`
- GRANTs: `select` to `authenticated`, `all` to `service_role` (no `anon`; inserts go through the edge function).
- RLS `select`: row visible if the caller owns the parent order (`orders.ordered_by_profile_id = auth.uid()`) **and** the parent message is not internal, OR the caller passes the existing staff/branch access check used elsewhere.

**Server**
- `order-engine` `sendMessage` gains an optional `attachments: [{file_name, file_path, file_size, mime_type}]` array. It re-runs the existing customer-ownership / staff-access check, validates count (≤5), size (≤50 MB) and mime allowlist server-side, verifies each `file_path` starts with the caller's own `tenants/{tenant_id}/…/messages/{order_id}/` prefix, then inserts the rows with the service client. Timeline event description notes the attachment count.
- New `order-engine` action `signMessageAttachment` — takes an attachment id, checks access the same way, and only then asks `s3-storage` to sign a read URL. This matters because `s3-storage` signs any path for any signed-in user, so attachment downloads must not go through it directly from the browser.
- Upload signing keeps using `s3-storage` `sign-upload`, but the upload path is generated client-side from the current tenant/branch/order, and the server re-validates the prefix on send, so a bad path can never be recorded.

**Client**
- New `src/components/messages/MessageAttachmentInput.tsx` (paperclip, file list, per-file upload state) and `MessageAttachmentChips.tsx` (rendered under a bubble; lazily fetches signed URLs).
- New `src/lib/messages/attachments.ts` — constants (limits, mime allowlist), `buildAttachmentPath()`, `uploadMessageAttachments()`, `getAttachmentUrl()`.
- `sendMessage()` in `src/lib/orders/mutations.ts` gains the `attachments` field.
- Wire into `src/pages/dashboard/CustomerOrderDetail.tsx` and `src/components/orders/detail/TimelinePanel.tsx`; the order-detail query joins `message_attachments` so chips render with the feed.

**Not included**
- No virus scanning, no image resizing, no attachment previews beyond an image thumbnail.
- Existing messages are unaffected.
