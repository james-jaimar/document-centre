

# Upload Progress Modal (Mimeo-style)

## What we're building

Replace the inline upload progress indicators with a modal dialog that opens automatically when files are dropped/selected. The modal shows each file's upload and processing status in real-time, with a "Continue" button that only enables once everything is done. This replaces the two-phase progressive approach with a single clean flow inside a modal.

## Changes

### 1. New component: `src/components/order/UploadProgressModal.tsx`

A Dialog-based modal that:
- Opens automatically when there are active uploads
- Shows a summary bar: "X Uploading | X Processing | X Completed | X Error"
- Lists each file with: filename, file size, a progress bar, and status label (Uploading / Processing / Complete / Error)
- Has a cancel button per file (sets status to cancelled, though we won't abort the actual upload mid-flight)
- Has a "Continue" button at the bottom that closes the modal, enabled only when all uploads are `done` or `error`
- Clean, polished design matching the app's glass-card aesthetic

### 2. Update `src/pages/dashboard/OrderFiles.tsx`

- Add state to control modal open/close
- When `handleFiles` is called, open the modal
- Pass `uploads` record to the modal
- On "Continue" (or close), dismiss the modal and clear uploads

### 3. Update `src/hooks/useDocumentUpload.ts`

- Revert to single-phase processing: remove the two-phase interim fetch / `analyzed` status. Just poll all jobs to completion, then save everything at once with `document_status: "ready"`.
- Keep progress updates granular so the modal can show: uploading (0-30%), processing (30-90%), done (100%).

### 4. Clean up `src/components/order/FileList.tsx`

- Remove the inline `activeUploads` progress section (the modal handles it now)
- Remove the `analyzed` status handling (no longer needed)
- Keep the document list with its existing thumbnail + metadata display

### 5. Clean up `src/components/order/DocumentPreviewThumb.tsx`

- Remove the "analyzing" overlay/badge (no longer needed since we use single-phase + modal)

## Technical notes

- The modal uses the existing `Dialog` component from `src/components/ui/dialog.tsx`
- Progress bar uses the existing `Progress` component
- The `uploads` state already tracks per-file status — we just surface it in the modal instead of inline
- Single-phase processing is simpler and more reliable; the modal gives the user clear feedback so they don't need to see a thumbnail early

