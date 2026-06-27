## Goal
Replace the raw HTML `<textarea>` in the platform Communications → Templates editor with a friendly rich-text editor and a live rendered preview, so you never have to look at HTML tags again.

## What changes

### 1. Templates tab — editor surface
In `src/pages/platform/PlatformCommunications.tsx` (Templates editor panel):

- Swap the HTML `<textarea>` for the existing `RichTextEditor` (`src/components/admin/RichTextEditor.tsx`, already used elsewhere — tiptap with Bold / Italic / H2 / H3 / lists / link / undo). No new dependency.
- Keep the Plain-text fallback as a plain `<textarea>` (that one is meant to be raw).
- Merge-token chips below the editor become **clickable** — clicking `{{branch_name}}` inserts it at the cursor (works in both the rich editor and the plain-text box, whichever is focused).
- Add a small "Edit raw HTML" toggle for power use / pasting designed HTML. Off by default. When on, shows the current textarea exactly like today so nothing is lost for advanced templates (e.g. the styled `Activate` button).

### 2. Live preview panel
Add a right-hand "Preview" pane next to the editor (stacks below on smaller screens):

- Renders the email exactly as recipients will see it: wrapped in the same branded shell used by `sendBranchActivationEmail` (logo block, card, padding, fonts).
- Uses sample values for merge tokens so you see real copy, not `{{branch_name}}`:
  - `branch_name` → "PostNet Sandton City"
  - `contact_name` → "Alex Smith"
  - `tenant_name` → tenant name (or "PostNet South Africa")
  - `portal_name` → tenant branding portal_name if set
  - `activation_link` / `action_link` / `store_url` → `https://example.com/activate/sample`
  - `login_email` → "owner@example.com"
- Subject line shown above the preview, also token-substituted.
- "Desktop / Mobile" width toggle (600px vs 380px iframe) so you can sanity-check on a phone width.
- Rendered inside a sandboxed `<iframe srcDoc=…>` so the email's inline styles don't leak into the admin UI.

### 3. Compose tab — same preview
The Compose tab already has a "Preview" expander that shows raw HTML. Replace that with the same iframe-based rendered preview component, reusing the helper from step 2. Compose stays read-only on the template body (you edit templates in the Templates tab).

### 4. Shared helper
New `src/lib/email/renderEmailPreview.ts`:
- `renderEmailShell({ portalName, primaryColor, logoUrl, bodyHtml })` — mirrors the wrapper in `supabase/functions/_shared/sendBranchActivation.ts` so preview === sent email.
- `applyMergeTokens(template, vars)` — same `{{var}}` substitution as `renderTemplate` in the edge function, with HTML-escaping for safety on the preview path only.
- `defaultPreviewVars(tenant)` — sample values listed above.

No backend / DB / edge-function changes. No change to what actually gets sent.

## Out of scope
- Image upload inside the editor.
- Full drag-and-drop block builder (MJML / Unlayer). Can be a follow-up if you outgrow tiptap.
- Changing the seeded template content.

## Files touched
- `src/pages/platform/PlatformCommunications.tsx` — editor swap, clickable tokens, raw-HTML toggle, preview pane wiring (both Templates and Compose tabs).
- `src/lib/email/renderEmailPreview.ts` — new shared render + token helper.
- New small component `src/components/admin/EmailPreviewFrame.tsx` — iframe wrapper with desktop/mobile toggle.
