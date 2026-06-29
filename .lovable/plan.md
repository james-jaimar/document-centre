# Marketing Email Layout Editor

You're right — for a cold marketing email, layout and imagery matter more than the words. Right now the `RichTextEditor` only handles bold/italic/headings/lists/links, so there's no way to drop in a hero, a product shot, or a two-column block. Here's the plan to fix that, scoped to the platform-level template editor.

## What you'll get

In **Platform → Communications**, when editing a marketing template, the body editor gains:

1. **Image insertion** — toolbar button that lets you:
   - Upload a file from your computer (PNG/JPG/WebP, up to ~5 MB)
   - Or paste a URL (for re-using the existing hero, screenshots, etc.)
   - Inserted as a full-width, responsive `<img>` (max 600 px, auto height, rounded corners) so it renders correctly inside the email shell.
2. **Layout blocks** — a small "Insert block" menu with email-safe presets that drop pre-built HTML into the editor:
   - **Hero image** (full-width image, no caption)
   - **Image + caption** (image with small grey caption underneath)
   - **Two-column** (image left, text right — using `<table>` so Outlook renders it)
   - **Button** (already-styled CTA button matching the brand accent)
   - **Divider** (thin horizontal rule)
   - **Spacer** (24 px vertical gap)
3. **Image alignment & size controls** — click any inserted image to get a small floating toolbar: left / centre / right align, and "small / medium / full width" size presets. Backed by Tiptap's `Image` extension plus a custom node-view.
4. **Bigger preview pane** — the existing right-hand preview already mirrors the real sent email; no change needed there, it'll just start showing your imagery live as you edit.

## Where images get stored

Uploaded images go to a **dedicated public Supabase Storage bucket** (`email-assets`, public read, 5 MB per file, image MIME only). The public URL is what's inserted into the HTML, so it works from every email client without auth. Bucket is created in a migration so it's reproducible.

I'll **not** use the Lovable Assets CDN here — those URLs are tied to the project preview origin, and email clients hammer them from many networks; Supabase Storage public URLs are the standard, durable choice for email-embedded media.

## What stays the same

- The send pipeline (`send-branch-marketing-campaign`) is untouched — it already strips tracking and injects the tenant origin into footer links. Images you embed via the editor are direct `<img src="https://...supabase.co/storage/...">` URLs, which is fine and looks legitimate (no `redirect?token=...` weirdness).
- Existing templates render exactly as before; the new toolbar is purely additive.
- The `Raw HTML` toggle and plain-text fallback remain — power users can still hand-edit.
- Activation-email templates use the same editor, so they get the upgrade too (harmless; they rarely need images).

## Technical notes

- `src/components/admin/RichTextEditor.tsx` — add `@tiptap/extension-image` and a small custom extension for alignment/size attributes; add toolbar buttons for "Insert image" and "Insert block". The "Insert block" menu inserts raw HTML via `editor.chain().insertContent(html).run()`.
- New file `src/components/admin/email-blocks.ts` — exports the HTML snippets for hero, two-column, button, etc., using inline styles and `<table>` layouts so Outlook/Gmail render them.
- New file `src/components/admin/EmailImageUpload.tsx` — small dialog: drag-drop or URL, uploads to `email-assets` bucket, returns the public URL.
- Migration: `create bucket email-assets (public)` with a policy allowing platform admins to insert/delete and anyone to read.
- The seed marketing template (`marketing_branch_offer`) gets updated to start with the hero block and a two-column "what you get" section, so new editors see a good starting point rather than a blank page.
- The plain-text fallback is **not** auto-derived from the new HTML (would lose meaning) — the existing manual textarea stays.

## Out of scope

- Drag-and-drop reordering of blocks (Tiptap's native arrow-up/arrow-down handles this well enough).
- A full "Mailchimp-style" visual block builder — overkill for the volume of marketing emails you're sending.
- AI-generated copy/imagery inside the editor — separate feature if you want it later.

Approve and I'll build it.
