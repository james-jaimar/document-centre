## Diagnosis

The "weird blank pages" appearing between documents come from the simplex parity logic in `buildPageSequence` (mirrored in two files):

- `src/components/order/PreviewPanel.tsx` (lines 181–186)
- `src/lib/orders/buildPreviewSnapshot.ts` (lines 238–242)

For every simplex body page, the system pushes a synthetic `blank_back` face (`pageIndex: -1`, empty thumbnail). When you have multiple documents, this means the **last page of Document A** gets a `blank_back` appended **before Document B starts**. In the FlipBook viewer this renders as a grey panel with a `FileText` icon and "Page N" label (FlipBook.tsx lines 65–73 — content role with no URL), which is what the screenshots show as "Page 32" and "Page 161".

This synthetic face is a preview-only artefact — it represents the physical reverse of a one-sided sheet, but for a multi-document upload the customer has no intention of producing a printed blank page there.

## What I'll change

### 1. Suppress inter-document `blank_back` in simplex sequences

In both `buildPageSequence` implementations, when a body page is the **last page of its document** AND the **next body section belongs to a different document**, do not emit the `blank_back` reverse face. The blank reverse is still emitted:

- between pages within the same document (real physical sheet behaviour)
- before a tab/insert anchored after that page (parity for the divider)
- at the end of the entire body when needed for back-cover parity

Effect: Document B simply begins on whichever spread slot falls naturally. If the customer wants Document B to start on a right-hand page, they can drop a white insert sheet between them — which the existing `InsertManager` already supports.

Files:
- `src/components/order/PreviewPanel.tsx` — modify `buildPageSequence` loop
- `src/lib/orders/buildPreviewSnapshot.ts` — same change in the snapshot mirror

### 2. Confirm insert-sheet behaviour is unchanged

`InsertManager.tsx` already lets users add a white (or coloured) insert sheet at any position. These are real `document_sections` with `section_type = "insert"` and emit two real physical faces (`insert` + `insert_back`) — they are NOT filtered by the change above and continue to render as solid colour sheets.

### 3. Record the merged-PDF output rule in memory

Save a new memory file `mem://features/order-flow/multi-document-merge-rules` capturing:

- Phantom inter-document `blank_back` faces are **not** emitted in the preview and must **not** be inserted into the final merged print-shop PDF.
- A user-added **insert sheet** (any colour, including white) IS a real physical sheet and **must** appear as a real blank/coloured page in the final merged PDF handed to the print shop.
- Tabs and inserts are the only mechanism for forcing a document to start on a right-hand page in a multi-document order.

Then add a one-line reference to this file under **Memories** in `mem://index.md`.

## Out of scope (for later)

The actual server-side PDF merge step (combining each document + insert sheets into one contiguous PDF for the print shop) is not yet implemented in `pdf-server`. This plan only fixes the preview artefact and records the rule so the eventual merge service follows it. Happy to scope that as a follow-up once we're ready to wire it up.

## Files touched

- `src/components/order/PreviewPanel.tsx`
- `src/lib/orders/buildPreviewSnapshot.ts`
- `mem://features/order-flow/multi-document-merge-rules` (new)
- `mem://index.md` (add reference)

No DB migrations, no VPS changes.