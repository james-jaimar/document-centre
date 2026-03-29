
## Fix the physical sequencing rule for tabs/inserts

The current preview is still anchoring the tab sheet too early.

### What is actually wrong
Right now `buildPageSequence()` in `src/components/order/PreviewPanel.tsx` injects tabs/inserts immediately after the anchor page number. That works for duplex boundaries in some cases, but it is wrong for the user case you described:

- after page 6
- page 6 is the front/right face of a simplex sheet
- page 7 must be the reverse/left face of that same sheet
- only then can the tab sheet begin as pages 8–9

So the sequence must be based on **finishing the current physical sheet**, not “after body page N” in the flat content stream.

## Implementation plan

### 1. Rework sequence building around physical sheets
In `src/components/order/PreviewPanel.tsx`:

- keep `page_range_start` as the user’s “after page N” anchor
- change `buildPageSequence()` so anchored items are inserted only **after the anchor page’s sheet is complete**

Rule set:
- **Simplex body page**:
  - push printed page N
  - if this is the anchor, do **not** insert yet
  - push the natural back face (`blank_back`) which represents page N+1 on the reverse
  - now inject the tab/insert sheet
- **Duplex body pages**:
  - complete the current physical sheet first
  - only inject after the sheet boundary

This removes the impossible `6 -> tab starts at 7` behavior.

### 2. Stop treating simplex blank backs as anonymous empties
Still in `PreviewPanel.tsx`, make the simplex reverse face explicit in the sequencing logic as the completion of the prior sheet. The code can still render it with the `blank_back` role, but the insertion timing must respect it as a required physical face before any tab/insert is added.

### 3. Keep tab/insert as full two-face sheets
Do not change the physical model:
- tab front = `tab`
- tab back = `tab_back`
- insert front = `insert`
- insert back = `insert_back`

That part is correct. The bug is the insertion point, not the two-face representation.

### 4. Keep the drawer anchor model unchanged
`src/components/order/TabInsertDrawer.tsx` can continue storing:
- `page_range_start = 6` meaning “after page 6”

No UX rewrite is needed for this fix. The preview engine should interpret that anchor correctly.

### 5. Verify page numbering text against the corrected sequence
After the sequencing fix, review the preview info in `PreviewPanel.tsx` so the spread labels align with the corrected physical order and no misleading “Pages 7–8” state appears where the tab should actually be 8–9.

## Files to update

- `src/components/order/PreviewPanel.tsx`

## Expected result

For simplex:
```text
Page 6 = front/right of sheet
Page 7 = back/left of same sheet
Page 8 = tab front/right
Page 9 = tab back/left
```

For the next tab after page 10:
```text
Page 10 = front/right
Page 11 = back/left
Page 12 = tab front/right
Page 13 = tab back/left
```

## Technical note
The core change is to make the anchor mean:

```text
insert after the physical sheet containing page N is complete
```

not:

```text
insert immediately after rendering page N
```

That is the simplest rule and matches the real-world print behavior you described.
