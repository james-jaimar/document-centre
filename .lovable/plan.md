
## Simplify the divider placement rule

You’re right: this got complicated because the code currently has two competing systems:

1. `buildPageSequence()` inserts tabs/inserts when it hits the anchor page
2. a later “alignment pass” tries to repair bad left/right placement by inserting extra blanks

That second step is what keeps causing nonsense.

## What to change

### 1. Make the anchor mean exactly this
In `src/components/order/PreviewPanel.tsx`, change the tab/insert placement rule to:

```text
After page N, place the tab/insert at the next available RIGHT-hand slot.
```

Not:
- immediately after page N
- not “after current array index”
- not “fix it later with a blank”

### 2. Move the right-hand logic into `buildPageSequence()`
Refactor `buildPageSequence()` so anchored tabs/inserts are queued once their anchor page is reached, but only flushed when the next physical face is a valid right-hand start.

That means:
- if page N is followed by a natural left/back face, let that face happen first
- then insert the tab/insert sheet
- if page N already ends on a left/back face, insert immediately at the next right page

### 3. Remove the post-processing alignment hack
Delete the bound-only alignment block in `PreviewPanel.tsx` that currently says:

- “Ensure tab/insert fronts land on even indices”
- and inserts `blank_back` before them

That logic is the source of the phantom blanks and repeated regressions.

### 4. Keep the existing physical sheet model
Do not change:
- simplex pages adding their natural `blank_back`
- front cover blank back
- tab = two faces (`tab`, `tab_back`)
- insert = two faces (`insert`, `insert_back`)
- PVC/back-cover handling

Those are fine. The bug is only when the divider gets injected.

## File to update
- `src/components/order/PreviewPanel.tsx`

## Expected behavior after the fix

If the customer says “put a tab after page 6”:

- page 6 stays where it is
- whatever face must naturally come next still happens
- the tab starts at the next RIGHT-hand slot
- the tab back is the following LEFT-hand face

So:
- after a right-hand page, the left/back completes first, then the tab
- after a left-hand page, the tab can start immediately on the next right
- no fake padding blanks get inserted just to repair parity afterward

## Technical note
Implementation-wise, the clean approach is:

- track anchored tabs/inserts as `pending`
- after each emitted body face, check whether the next insertion index is a right-hand slot in the flipbook model
- only then flush pending dividers
- remove the later parity-correction loop entirely

This makes the preview obey one simple physical rule from the start instead of rendering first and trying to patch mistakes afterward.
