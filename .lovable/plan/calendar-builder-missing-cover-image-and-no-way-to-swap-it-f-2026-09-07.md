# Calendar builder: missing cover image and no way to swap it from the library

## What happened (confirmed vs not)

Confirmed by reading the builder code:

- The "Browse photo library" button is only shown when a picture box is **empty**. Once a box holds an image, the only control offered is **Replace** — and that opens the file picker. So there is no way to swap a placed picture for another library photo. That matches exactly what you are seeing on the cover.
- When a placed picture fails to re-load from storage, the code logs a warning and does nothing else: the box still counts as filled, but nothing is drawn. The result looks like "the image vanished" while the box is still considered done — and, because it is still considered filled, the library button stays hidden.

Not confirmed yet: **why** the cover picture stopped loading. It could be the stored file itself, or the local image cache dropping it during all the back-and-forth proofing. The first step below settles that before anything is changed.

## Plan

1. **Find out what happened to that cover picture.**
   Look up the calendar you are working on, read what is stored against the cover box, and try to fetch that exact file. That tells us whether the file is missing/unreadable in storage or whether the browser simply lost its local copy. The result decides whether step 4 needs to be wider.

2. **Let any picture be swapped from the library, not just empty ones.**
   The picture card gets both actions when it is filled: **Replace** (upload) and **Photo library**. Same behaviour on every picture box in the builder, including the cover.

3. **Show it plainly when a picture cannot be displayed.**
   If a placed picture will not load, the box shows a clear "this picture could not be loaded — choose another" state instead of quietly appearing blank, with the retry, upload and library buttons right there. Proofing and adding to the basket warn rather than silently producing a calendar with a hole in it.

4. **Make re-loading more forgiving.**
   Retry the fetch once before giving up, and stop the local image cache from discarding pictures that are currently in use in the calendar, so long proofing sessions do not lose them.

## Technical notes

- `src/components/artwork/PlaceholderPanel.tsx` — currently gates `onBrowseLibrary` behind `!v`; render it alongside Replace when `v` exists, and add a broken-image state.
- `src/pages/dashboard/TemplatedArtworkBuilder.tsx` — the `placedImages` effect (around lines 317-344) swallows failures; track failed placeholder ids in state, expose them to the panel, add a single retry, and block/flag proof + add-to-cart when a filled box has no loadable image.
- `src/lib/photoPrints/photoBlobCache.ts` — 200-entry LRU that revokes the oldest object URL; add pinning (or raise the cap for artwork paths) so in-use calendar images are never evicted.
- No schema, pricing, edge function or PDF-server changes.
