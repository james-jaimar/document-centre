I agree this needs a proper reset rather than another patch on top of patches.

Do I know what the issue is? Yes — the main failure is not just “rotation didn’t run”. The current flow is letting old render artefacts compete with new rotated render artefacts, and the thumbnail picker is likely selecting the old landscape thumbnail again after rotation.

Current problem, exactly:

1. The PDF rotation job may promote a rotated/normalised PDF, but the asset’s old `derived_files` preview/thumbnail rows remain attached to the same asset.
2. After rotation, the frontend clears `documents.thumbnail_urls`, then calls `generate-previews` again.
3. `pickBestPerPage()` looks at all derived files for the asset and prefers the image with the largest pixel width.
4. A landscape thumbnail is often 360px wide, while a portrait thumbnail may be around 254px wide because the thumbnail max dimension is 360px on height.
5. So after a successful portrait rotation, the picker can still choose the old landscape thumbnail because it is “wider”. That explains the screenshot: the page frame/dimensions have moved toward portrait, but the actual image shown is still the old landscape render.
6. Binding art then appears broken/strange because the preview is now receiving contradictory signals: portrait page geometry, landscape artwork, and a binding image path/error fallback that is not isolated strongly enough.

Plan to fix this properly

1. Replace “rotate then hope the right thumbnail wins” with an authoritative orientation pipeline

- Add/adjust the backend orientation operation so it is target-based, not just `angle=90` based.
- The operation should accept the intended final orientation: `portrait` or `landscape`.
- It should bake page rotation into real page geometry, promote the output to `asset.normalized_storage_path`, and update:
  - `page_count`
  - `width_pt`
  - `height_pt`
  - `boxes`
  - per-page metadata where available
- It should verify the result before marking the job done:
  - page 1 dimensions match the target orientation
  - no residual `/Rotate` ambiguity remains where possible
  - the promoted file path is the one downstream preview rendering will use

2. Stop stale thumbnails from competing with new rotated thumbnails

- Add a backend helper/repository method to clear or invalidate old preview artefacts for an asset before generating new pages after operations that change geometry.
- Use it for:
  - orientation rotation
  - resize/scale
  - crop/trim where appropriate
- At minimum, remove old `preview_page` and `thumbnail_page` derived-file rows before re-rendering a rotated document.
- This is the key fix: after rotation, `pickBestPerPage()` must only see the fresh rotated thumbnails, not older landscape thumbnails from before the transform.

3. Make thumbnail selection safer

- Update `pickBestPerPage()` so it does not blindly choose the widest image when multiple same-kind candidates exist.
- Prefer one of these safer rules:
  - newest generated candidate per page, or
  - candidate from the most recent preview job, or
  - candidate matching the current document aspect ratio.
- Keep the existing “cropped files win when intentionally trimming” rule, but prevent stale wider landscape thumbnails from overriding fresh portrait ones.

4. Refactor the client orientation flow into a clear state machine

In `OrderFiles.tsx`, replace the current layered orientation handling with a single sequence:

```text
uploaded/inspected
  -> orientation_mismatch persisted
  -> advisory opens
  -> user clicks rotate
  -> document marked orientation_action='rotating'
  -> backend target-orientation job runs
  -> stale derived previews invalidated
  -> fresh previews generated
  -> documents row updated from authoritative asset dimensions
  -> orientation_resolved=true
  -> configure preview uses only fresh thumbnails
```

Specific frontend changes:

- Pass target orientation (`portrait`/`landscape`) to the backend instead of only `angle=90`.
- Mark the document as `orientation_action: "rotating"` immediately so the advisory cannot reopen mid-flow.
- After backend completion, re-fetch the asset and update both:
  - `page_width_mm` / `page_height_mm`
  - `preflight_data.effective_width_mm` / `effective_height_mm`
- Clear `thumbnail_urls` before rendering.
- After rendering, write the fresh thumbnail paths only once.
- Remove or heavily restrict the legacy dimension fallback that can reopen the modal based on stale dimensions.

5. Fix the binding preview regression separately, not inside the PDF pipeline

- In `BindingSpine.tsx`, make failed binding artwork render via React state instead of leaving a broken `<img>` momentarily visible.
- Use `display: none` / conditional rendering for failed images, not only `visibility: hidden`.
- Ensure the fallback strip is clipped to the binding spine only and cannot overlap the document artwork.
- Check that comb binding black resolves to a valid bundled asset.
- Keep ring-binder preview isolated, per the existing project constraint.

6. Add targeted diagnostics for this specific class of issue

Add temporary-but-useful logging around orientation operations:

- asset id
- old normalized path
- new normalized path
- old derived preview count
- derived rows cleared
- new derived preview count
- picked thumbnail paths
- old/new dimensions

This will make it obvious if the frontend ever picks a pre-rotation image again.

7. Verification checklist after implementation

Test these flows:

- Bound Document + landscape PDF -> advisory -> rotate -> final preview is portrait, content is portrait, configure preview is portrait.
- Confirm `documents.thumbnail_urls` contains only fresh post-rotation paths.
- Confirm derived-file selection no longer chooses old landscape images.
- Confirm binding spine shows comb binding/fallback cleanly with no broken icon or text.
- Presentation + portrait PDF -> rotate to landscape still works.
- Size scaling and bleed trimming still render the correct thumbnails.
- Ring binder preview remains unaffected.
- Mixed-orientation PDFs are not accidentally guillotined by a global render box.

Files likely to change

- `pdf-server/app/tasks/operation_tasks.py`
- `pdf-server/app/tasks/document_tasks.py`
- `pdf-server/app/services/pdf_ops.py`
- `pdf-server/app/services/derived_files.py`
- `src/hooks/useDocumentUpload.ts`
- `src/lib/thumbnailUtils.ts`
- `src/lib/documentCentreApi.ts`
- `src/pages/dashboard/OrderFiles.tsx`
- `src/components/preview/BindingSpine.tsx`

Outcome

The aim is to remove the competing layers entirely: one authoritative backend transform, one fresh preview generation pass, one set of thumbnail rows, and one client state transition. No stale landscape thumbnails should be able to survive and reappear after a rotation.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>