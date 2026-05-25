# Quotes: sidebar link + customer PDF/email actions

## 1. Add "Quotes" to the customer left sidebar
File: `src/components/CustomerSidebar.tsx`

- Import `FileText` icon from lucide.
- Insert a new auth-only nav entry between **Orders** and **Cart**:
  ```
  { to: tenantPath("quotes"), icon: FileText, label: "Quotes", exact: false }
  ```
- Public (anonymous) nav stays unchanged — quotes require an account.

## 2. Add Download PDF + Email Me buttons on the customer quote detail page
File: `src/pages/dashboard/CustomerQuoteDetail.tsx`

Existing hooks already cover both flows:
- `quote-pdf` Edge Function returns `{ storage_path }` for the generated PDF.
- `useSendQuoteEmail` (in `src/hooks/useQuotes.ts`) calls `send-quote-email`, which generates the PDF and emails it with a signed download link.

Changes:
- Add a small `useDownloadQuotePdf` mutation in `src/hooks/useQuotes.ts` that:
  1. Invokes `quote-pdf` with `{ quote_id }`.
  2. Reads `storage_path` from the response.
  3. Creates a 5-minute signed URL via `supabase.storage.from("documents").createSignedUrl(path, 300)`.
  4. Opens the URL in a new tab (`window.open(url, "_blank")`).
- In `CustomerQuoteDetail.tsx` header action row, add two new buttons next to **Decline** / **Add to Cart** (visible for all statuses, not just active):
  - **Download PDF** — `variant="outline"`, `Download` icon, calls the new hook. Toast on error.
  - **Email me a copy** — `variant="outline"`, `Mail` icon, calls `useSendQuoteEmail`. Success toast: "Quote emailed to {customer_email}".
- Both buttons show a spinner / `disabled` state while pending.

## 3. Verification
- Sidebar: as a signed-in customer, the **Quotes** link appears between Orders and Cart, navigates to `/t/:slug/quotes`, and highlights when active.
- Quote detail: **Download PDF** opens the generated PDF in a new tab; **Email me a copy** triggers `send-quote-email` and shows a success toast; existing **Decline** / **Add to Cart** continue to work.

## Out of scope
- Admin-side quote actions (already have their own buttons).
- Letter-size modal flash (deferred earlier).
- Any changes to the PDF template itself.
