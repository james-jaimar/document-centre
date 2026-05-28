# Add retry for failed mobile photo uploads

## Problem
On the mobile upload page (`/upload/:token`), if a photo fails to upload, the customer is stuck — there is no way to retry that file. Once any upload finishes (success or error), the page flips into "all done" mode and hides the upload buttons too, so the only option is "Upload More", which re-picks the file from scratch.

## Fix (frontend only, `src/pages/MobileUpload.tsx`)

1. **Per-file Retry button** — for any row with `status === "error"`, show a small "Retry" button next to the error message that re-runs `uploadFile(u)` for that single item (resets its status to `pending`, then `uploading`).

2. **"Retry all failed" action** — when `errorCount > 0`, add a button above the list that re-uploads every failed item sequentially.

3. **Don't flip to "all done" when there are failures** — only show the green "Upload Complete!" success screen when `errorCount === 0`. If some failed, keep the Select Photos / Browse Files buttons visible so the customer can also add more, and keep the failed rows with their Retry buttons.

4. **Friendlier error copy** — if `err.message` is empty or generic, fall back to "Upload failed — tap Retry to try again." Keep the existing specific server messages (file too large, expired link, etc.) when present.

No backend, edge function, or schema changes — `mobile-upload` already supports repeat POSTs for the same session.
