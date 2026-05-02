## Problem

When photos have been uploaded, the initial `PhotoUploader` component (which includes the "Upload from Phone" button) is replaced by a compact drag-drop bar. This bar only has an "Add more photos" button — the phone upload option disappears.

## Fix

Add a "Upload from Phone" button (with Smartphone icon) to the drag-drop bar in `PhotoPrintsBuilder.tsx` (around line 490-498), next to the existing "Add more photos" button.

### Changes: `src/pages/dashboard/PhotoPrintsBuilder.tsx`

In the `else` branch (lines 462-510), add a second button next to "Add more photos" that calls `handlePhoneUpload()` — the same handler already wired up for the initial `PhotoUploader`.

The buttons will be wrapped in a flex container with a small gap. The new button will use the `Smartphone` icon (already imported indirectly via PhotoUploader, but we'll import it directly) and have the same `outline`/`sm` styling.
