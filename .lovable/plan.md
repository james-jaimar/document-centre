

## Fix: Extra rotation only for half-fold

### Root cause
Lines 49-51 in `BrochureViewer.tsx` apply 180° `extraRotation` whenever ANY panel is folded. This was needed for half-fold (to show front cover instead of back face after folding), but tri/z/gate folds don't need it — the centre panel stays visible and correct.

### Fix

**`src/components/preview/brochure/BrochureViewer.tsx`**

The automatic 180° scene rotation should only apply to `bi_fold`. For other fold types, `extraRotation` should only come from the manual "View Back/Front" toggle.

```
const isHalfFold = foldType === "bi_fold";
const extraRotation = anyFolded
  ? isHalfFold
    ? (surface === "outside" ? (showingBack ? 0 : 180) : (showingBack ? 180 : 0))
    : (rotatedFolded ? 180 : 0)
  : 0;
```

This means:
- **Half-fold**: keeps current working behavior (auto-show front, toggle to back)
- **Tri/Z/Gate**: no auto-spin on fold; "View Back" button still works for manual rotation

One file change only.

