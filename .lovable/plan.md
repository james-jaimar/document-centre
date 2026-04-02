

# Plan: Fix Image Upload Progress Tracking After PDF Conversion

## Problem

When an image is uploaded, the progress tracker creates an entry keyed by the original filename (e.g., `2.png`) at 5%. After conversion to PDF, `file.name` changes to `2.pdf`, and all subsequent `updateUpload` calls create a **second** entry under `2.pdf`. The original `2.png` entry stays permanently stuck at "Converting image to PDF… 5%".

The modal shows both entries — one stuck, one complete — and the "all done" check never passes for the stuck one, keeping the user blocked.

## Fix

**`src/hooks/useDocumentUpload.ts`** — After converting the image to PDF, continue using `originalName` as the tracking key instead of `fileName`:

1. After `imageFileToPdf`, remove the stuck entry and re-key it, OR simply use `originalName` throughout instead of `fileName` for all `updateUpload` calls
2. The simplest fix: after conversion, update the existing entry's `fileName` display text but keep the same key

Concretely: change all `updateUpload(fileName, ...)` calls after the conversion to use `originalName` instead, so there's only ever one tracking entry per file.

## Changes

| File | Change |
|------|--------|
| `src/hooks/useDocumentUpload.ts` | Use `originalName` as the consistent tracking key throughout `uploadFile`. Update the entry's display `fileName` to show the `.pdf` name but keep the dictionary key as `originalName`. |

## Implementation
- Line ~287: keep `fileName` for storage path but use `originalName` for all `updateUpload` calls
- Lines 296, 310+, etc.: replace `updateUpload(fileName, ...)` → `updateUpload(originalName, ...)`

