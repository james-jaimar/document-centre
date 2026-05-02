You’re right to be annoyed. The immediate break is not the rotation formula. I can see the likely cause in the code that was just added:

The editor now measures its cropper container with a `ResizeObserver`, but that observer is created only once on component mount. The modal is mounted while closed, so `containerRef.current` is `null` at that moment. The effect exits, never runs again when the modal opens, and `containerDims.w` stays `0`. Because the cropper is gated by:

```ts
signedUrl && containerDims.w > 0
```

it can sit forever on “Loading photo…”.

## Plan

1. Fix the modal container measurement bug in both editors
   - Update `PhotoEditorModal.tsx` and `PosterImageEditor.tsx` so the cropper container is measured when the dialog actually opens, not only on initial mount.
   - Use a robust shared pattern:
     - read `getBoundingClientRect()` immediately when open
     - attach `ResizeObserver`
     - disconnect it on close/unmount
     - reset dimensions safely when the modal closes
   - This will remove the false “Loading photo…” state caused by `containerDims.w` staying `0`.

2. Make the cropper render condition less fragile
   - Keep waiting for a real image URL, but don’t allow a missed observer to permanently block the cropper.
   - Add a small fallback/default crop frame from the hook so the cropper can initialize even if the first measurement arrives one tick late.

3. Preserve the shared rotation/fill logic
   - Keep `useCropperZoom` as the single source of truth for Photo Prints and Posters.
   - Do not add new separate scaling logic.
   - Once the cropper actually mounts, the existing fill/fit geometry can run as intended.

4. Clean up misleading third-party console noise separately
   - The screenshot also shows a `Unable to store cookie` error from the Tawk chat widget, not from the photo cropper.
   - I will prevent the chat widget from loading on logged-in/order/editor surfaces where it is not needed, so it stops polluting the console while you’re testing checkout/editor flows.

## Files to update

- `src/components/photo/PhotoEditorModal.tsx`
- `src/components/order/PosterImageEditor.tsx`
- `src/components/ChatWidget.tsx` or `src/components/CustomerLayout.tsx` for the Tawk cleanup

## Expected result

- Opening “Edit Photo” after uploading should show the actual cropper instead of getting stuck on “Loading photo…”.
- Rotating portrait/landscape images should use the same shared fill/fit calculation in both photo and poster editors.
- The unrelated Tawk cookie error should no longer distract from real editor errors on order pages.