
## Simplified fix

You are right: the rule should be simpler and more physical.

If a user places a tab or insert **after page 6**, and page 6 is currently the **right-hand printed face**, then:
1. page 6 remains as-is
2. its reverse side continues as the natural back of that same sheet
3. only **after that sheet is complete** do we insert the tab/insert sheet

So the system should work from **sheet completion**, not from “odd/even preview index” patching.

## What to change

### 1. Move the rule into sequence building, not post-processing
In `src/components/order/PreviewPanel.tsx`, simplify `buildPageSequence()` so it decides insertion timing correctly while building the page list.

Instead of:
- building pages
- then scanning for tab/insert roles
- then injecting `blank_back` later to force even indices

Do this:
- append each body page
- if the section is simplex, append its natural `blank_back`
- then inject any anchored tab/insert items for that page

That matches the rule you described exactly.

### 2. Remove the alignment post-processor
Delete the current post-processing block in `PreviewPanel.tsx` that says:
- tab/insert fronts must be on even indices
- inject `blank_back` before them if needed

That logic is what is causing the extra blank and is the main source of overcomplication.

### 3. Keep duplex snapping only in the anchor stage
Still keep the existing rule that for duplex documents, anchors must snap to valid sheet boundaries:
- duplex: odd anchors snap to next even page
- simplex: every page is valid, because the natural back is already added

This preserves physics without later “repair” logic.

### 4. Preserve tab/insert as two-faced sheets
Keep:
- tab → `tab`
- tab back → `tab_back`
- insert → `insert`
- insert back → `insert_back`

That part is still correct. The issue is only when they are inserted.

### 5. Leave the overlay/rendering alone for now
`FlipBook.tsx` and `PageEffects.tsx` do not need another conceptual rewrite for this specific fix.
The main correction is the page sequence generation in `PreviewPanel.tsx`.

## Expected result

For simplex:
```text
Page 6 front
Page 6 back (blank_back)
Tab front
Tab back
Next document page
```

For duplex:
```text
Page 5 / Page 6 complete the current sheet
Tab front starts at next valid sheet boundary
Tab back follows
```

## File to update

- `src/components/order/PreviewPanel.tsx`

## Why this is the right simplification

The preview should not “correct” physics afterward by looking at preview indices.
It should build the physical sheet order correctly the first time:
- finish the current sheet
- then insert the next physical sheet

That gives the behaviour you just described and removes the extra blank-page bug at the root.
