

# Plan: Fix Upload Getting Stuck on "Please wait..."

## What broke

The upload flow has a **race condition** that was always latent but is now manifesting. Here's the sequence:

1. `useDocumentUpload(orderItem?.id)` — the hook captures `orderItemId` from the query result
2. `handleFiles` opens the upload modal, then calls `uploadFiles(files)`
3. Inside `uploadFile`: `if (!orderItemId || !user) return null;` — **silently exits** with no upload entry created
4. The modal shows zero entries, `allDone` is `false`, the Continue button is disabled, and escape/click-outside are prevented — the user is trapped

This can happen when:
- The React Query for `orderItem` hasn't resolved yet at the moment the user drops files
- For new orders: `ensureOrder()` returns the ID but doesn't pass it to `uploadFiles` — React hasn't re-rendered with the new `orderItem.id` yet
- A stale `uploadFiles` closure is captured in `handleFiles`

The modal also has **no escape hatch** — once open with zero entries, the user can never close it.

## Fix (3 changes)

### 1. `UploadProgressModal.tsx` — add escape hatch
- When `entries.length === 0`, show "No files uploading" and enable the close button
- Allow closing via X button or escape when nothing is in progress

### 2. `useDocumentUpload.ts` — accept override orderItemId
- Change `uploadFile` and `uploadFiles` to accept an optional `overrideOrderItemId` parameter
- If provided, use it instead of the hook-level `orderItemId`
- This eliminates the stale-closure race condition

### 3. `OrderFiles.tsx handleFiles` — pass the ID directly
- Capture the ID returned by `ensureOrder()` 
- Pass it to `uploadFiles(files, undefined, itemId)`
- For existing orders this is the same value; for new orders it ensures the ID is available immediately

## Files to change

| File | Change |
|------|--------|
| `src/components/order/UploadProgressModal.tsx` | Allow close when entries empty; add close/cancel button |
| `src/hooks/useDocumentUpload.ts` | Add `overrideOrderItemId` param to `uploadFile` and `uploadFiles` |
| `src/pages/dashboard/OrderFiles.tsx` | Pass `orderItemId` from `ensureOrder()` to `uploadFiles` |

