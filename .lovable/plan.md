# Stock image library (Pexels) for calendar artwork

Let customers fill calendar image boxes from a searchable photo library instead of only uploading their own file.

## What the customer sees

In the calendar builder, each image box gets a second option next to "Click to upload your file": **Browse photo library**.

- A panel opens with a search box, a few starter categories (Landscapes, Wildlife, Cape Town, Abstract, Seasons…), and an endless grid of results.
- Results are filtered to photos that suit the box shape (landscape/portrait) and are large enough to print at A2 — anything too small is hidden rather than shown and rejected later.
- Clicking a photo picks it: it lands in the box exactly like an uploaded file, with the same crop, zoom and low-resolution warning behaviour.
- The photographer's name shows under the box and is stored with the order (Pexels requires crediting the photographer).
- Photos already used elsewhere in the same calendar are marked, so it is easy to avoid repeats.

## How it works behind the scenes

- The Pexels key is stored as a project secret, never in the browser. A new edge function `stock-images` does two things: search (returns trimmed results — id, thumbnail, size, photographer, link) and select (fetches the original full-size file server-side and writes it into the same S3 location a customer upload would use).
- Because the chosen photo becomes a normal file in S3, the whole downstream path is unchanged: preview compositing, proofing, the PDF server's full-resolution stamping, print-ready output.
- Searches are rate-limited per session and cached briefly, so heavy browsing doesn't burn the API quota.

## Print quality guard

A2 at 300 dpi is roughly 7000×4960 px. Most Pexels originals are 4000–6000 px on the long edge, which is 200–250 dpi at A2 — good, but not perfect. The library results are scored against the actual box size in millimetres and marked **Excellent / Good / Not big enough**; only the first two are selectable. The existing soft-print warning still applies once the customer crops in.

## Licensing

Pexels photos are free for commercial use, including print products, with no attribution legally required but requested. Three things the plan covers:
- Photographer name and photo link stored on the order item and shown in the builder.
- The Pexels-required "Photos provided by Pexels" credit with a link, shown in the library panel.
- Redistribution of unmodified photos as a standalone product is not allowed by their terms — printing them as part of a calendar is fine, so the picker stays inside the artwork builder and is not offered as a "print this photo" product.

## Technical notes

- New edge function `supabase/functions/stock-images/index.ts` — actions `search` (query, orientation, page, min pixels) and `select` (photo id, target object path); validates JWT with `supabase.auth.getUser()`, Zod-validated input, CORS headers.
- Secret: `PEXELS_API_KEY`.
- New component `src/components/artwork/StockImagePicker.tsx`, opened from `PlaceholderPanel.tsx` alongside the existing file input; on pick it calls `select` and then reuses the exact same "file placed" path as an upload (same value shape: `file_name`, `storage_path`, natural width/height, crop, zoom).
- Placeholder value gains optional `source: { provider: "pexels", photo_id, photographer, photographer_url, photo_url }`, persisted in the order item spec so the credit survives into admin and production views.
- New table `public.stock_image_uses` (tenant_id, branch_id, order_item_id, provider, photo_id, photographer, url) with grants + RLS mirroring the other order-scoped tables, for licence record keeping.
- Scope for this first pass: the templated artwork builder (calendars). The picker is written as a standalone component so Canvas Prints and Photo Prints can adopt it later with one line each.

## Order of work

1. Store the Pexels key as a secret.
2. `stock-images` edge function: search + server-side fetch into S3.
3. `StockImagePicker` panel with search, categories, orientation/size filtering, quality badges.
4. Wire into `PlaceholderPanel` and persist the photographer credit.
5. `stock_image_uses` table and credit display in admin order view.
6. End-to-end check: pick a photo, proof it, generate print-ready A2 and confirm full resolution lands in the PDF.
