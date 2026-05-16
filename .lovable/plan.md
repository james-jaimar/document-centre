## Problem

The previous fix only patched `src/lib/orders/buildPreviewSnapshot.ts`, which is the snapshot used by the **placed-order** detail page. The screenshot you sent is the **live configurator** (`/t/:slug/new-order` → Bound Documents step 2), which renders via a different module: `src/components/order/PreviewPanel.tsx`. That file has its own PVC cover injection that still hardcodes `isColor: true`, so it ignores the B&W choice no matter which PVC cover variant is picked.

## Root cause (single line)

`src/components/order/PreviewPanel.tsx` line 450:

```ts
fp.unshift({ thumbnailUrl: frontThumb, pageIndex: 0, documentName: "PVC Cover", section: undefined, isColor: true });
```

The body page that supplies `frontThumb` already carries the correct `isColor` (derived from `section.is_color`, which reflects the user's Print Colour choice). The unshift just throws it away.

## Fix

In `src/components/order/PreviewPanel.tsx`, inside the `if (isPvc && fp.length > 0)` block (~lines 448–452):

1. Capture the source page before unshifting: `const frontSource = fp[0];`
2. Use `frontSource?.isColor ?? true` for the PVC front face.
3. Leave the PVC back face as `isColor: true` (it's a translucent reverse with no artwork — greyscale conversion doesn't apply).

That's the only edit. Covers all three PVC variants (clear / frosted / matte) and all bound product types (wire, comb, spiral, perfect, saddle) because they share this single injection point.

## Verification

1. Configurator → Bound Document → choose **Black & White** → upload colour PDF → pick **Frosted Front + Black Card Back** (the exact case in your screenshot). Cover should now render greyscale.
2. Repeat with **Matte Front** and **Clear PVC** variants — all greyscale.
3. Switch Print Colour back to **Full Colour** → cover renders in colour.
4. Real (non-PVC) front cover uploads, card back covers, tabs, inserts, ring binder body pages — no change.

## Out of scope

- Print-ready PDF pipeline (server already greyscales at paid-order time).
- Cover artwork upload flow, pricing, anything outside this single injection.
