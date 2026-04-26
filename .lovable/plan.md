
# Frontend Integration: Thumbnail Gap Self-Healing

Now that the VPS guarantees per-page completeness and exposes `POST /v1/assets/{id}/render-pages`, the frontend should:

1. Detect any gaps remaining after the initial polling loop.
2. Automatically call the new endpoint to surgically re-render only the missing pages.
3. If gaps still persist after auto-recovery, surface a clear UI state with a one-click manual "Re-render missing pages" button.
4. Render a friendly placeholder (instead of a silent blank) anywhere a thumbnail is still missing.

---

## 1. API client — `src/lib/documentCentreApi.ts`

Add a thin wrapper for the new endpoint:

```ts
export async function renderPages(
  assetId: string,
  pages: number[] | "missing",
): Promise<{ job_id: string | null; missing_pages: number[] }> {
  return request(`v1/assets/${assetId}/render-pages`, "POST", { pages });
}
```

Return shape mirrors the server (`job_id` may be `null` when nothing to render).

---

## 2. Polling + auto-recovery — `src/hooks/useDocumentUpload.ts`

Update `renderDocumentThumbnails` so it never silently returns gaps:

- After the existing polling loop completes, compute the `missing` indices (already tracked at line 116‑125).
- If `missing.length > 0`, run **up to 2 recovery passes**:
  1. Call `renderPages(assetId, missingPageNumbers)`.
  2. `pollJob(job_id)` (skip if `job_id === null`).
  3. Re-fetch `getDerivedFiles` and recompute `thumbnailPaths` via `pickBestPerPage`.
  4. Re-poll for up to ~20s with the same adaptive interval, in case the salvage pass is still flushing.
- Persist `thumbnail_urls` (index-stable, length = `expectedPages` — keeps the spread-parity contract).
- If gaps remain after recovery, also persist a new `thumbnail_gaps: number[]` value in the `documents` row metadata (see schema note below) so the UI can show a manual recovery affordance.
- Set `document_status`:
  - `"ready"` when no gaps,
  - `"ready"` (still) when partial — gaps are a soft state, not a hard failure (the rest of the file is usable). The badge in the file list communicates the issue.

Tunables (top of file):
```ts
const MAX_THUMB_POLLS = 45;          // bumped from 30 → ~90s ceiling
const RECOVERY_ATTEMPTS = 2;
const RECOVERY_POLL_BUDGET_MS = 20_000;
```

### Schema note
`thumbnail_gaps` can live inside the existing `preflight_data` JSONB column to avoid a migration:

```ts
preflight_data: {
  ...(existingPreflight ?? {}),
  thumbnail_gaps: missing.length ? missing : undefined,
}
```

The same field is cleared (set to `undefined`) on a successful re-render so the badge disappears.

---

## 3. File list badge + manual re-render — `src/components/order/FileList.tsx`

Add a "Re-render N pages" affordance when `preflight_data.thumbnail_gaps` is non-empty:

- New small warning chip next to the existing "Review needed" / "page count" row, e.g. `⚠ 1 page missing`.
- A new icon button (next to the existing reprocess `RefreshCw`) titled "Re-render missing pages". Clicking calls a new prop:

```ts
onRerenderGaps?: (doc: Document) => Promise<void>;
```

Internally the parent (`OrderFiles.tsx`) wires this to a thin handler that:
1. Reads the doc's `backend_asset_id` and `preflight_data.thumbnail_gaps`.
2. Optionally calls `ensureFreshAsset` (already added in the previous round) to handle stale VPS assets.
3. Calls `renderPages(assetId, gaps)` → `pollJob` → re-fetches derived files → `supabase.from("documents").update({ thumbnail_urls, preflight_data })`.
4. Toasts success/failure.

The existing reprocess button (full re-rasterize) stays — gaps recovery is the lighter surgical path.

---

## 4. Defensive UI — placeholder for missing thumbnails

Today, missing thumbnails render as a blank white sheet (preserving spread parity, per memory `mem://features/preview-system/physical-alignment-logic`). Improve perceived quality:

- **`src/components/preview/FlipBook.tsx`** — when rendering a body face whose `urls[i]` is empty/null, draw a subtle placeholder: dashed border + `AlertCircle` + "Page didn't render — try Re-render". Keep the same dimensions so spread parity is untouched.
- **`src/components/order/FileList.tsx`** — `ThumbnailImage` already falls back to a `FileText` icon when no URL; no change required there for the leftmost mini-thumb (which uses index 0 — almost always present).

This makes the difference between "PDF has a blank page" and "we failed to render it" obvious to the user.

---

## 5. Order/cart hot paths — no changes required

`useCart.ts` and `buildPreviewSnapshot.ts` already treat `thumbnail_urls` as a plain string array; an empty entry will continue to behave consistently (previewer renders the new placeholder, cart preview still works).

---

## Files touched

- `src/lib/documentCentreApi.ts` — add `renderPages(assetId, pages)`.
- `src/hooks/useDocumentUpload.ts` — bump poll cap, add 2-pass auto-recovery using `renderPages`, persist `thumbnail_gaps` into `preflight_data`.
- `src/pages/dashboard/OrderFiles.tsx` — new `handleRerenderGaps` handler; pass to `<FileList />`; clear gaps on success.
- `src/components/order/FileList.tsx` — gap badge + re-render icon button; new `onRerenderGaps` prop.
- `src/components/preview/FlipBook.tsx` — friendly placeholder for missing-thumbnail body faces (spread-parity preserved).

## Out of scope (explicitly)

- No DB schema migration — `preflight_data` JSONB carries the gap list.
- No change to the upload flow's success criteria (a doc with gaps is still `ready`; only the badge differentiates).
- No change to brochure / fold / ring binder preview math (only the missing-face fallback visual).
