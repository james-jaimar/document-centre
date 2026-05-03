## Problem

When a customer selects single-sided (simplex) printing for loose sheets, the preview inserts "Blank (Back)" pages after every content page. This is physically accurate for bound documents (where a simplex sheet has two faces), but for loose sheets it's unnecessary — the customer just wants to see their pages 1 through N.

The screenshot confirms: "Blank (Back) of 8" is shown for a simplex loose-sheets order.

## Performance Note

The preview slowness is likely related to network latency (signed URL fetching and PDF worker loading), not a code issue. The previous fix already bundled the PDF worker locally, which should help in production. No additional performance changes are needed at this stage.

## Plan

**File: `src/components/order/PreviewPanel.tsx`**

In `buildPageSequence()` (~line 226), the simplex blank-back injection currently runs for all simplex sections. Add a condition to skip blank-back insertion when the document is **not bound** (`!isBound`).

The change is a single guard: when `!isBound`, never emit `blank_back` faces for simplex pages. This means loose sheets and poster previews will show only the content pages, matching what the customer expects for single-sided printing.

Specifically, change the condition at line 226 from:
```
if (!section.is_duplex && !forceDuplex) {
```
to:
```
if (!section.is_duplex && !forceDuplex && isBound) {
```

This ensures blank backs are only emitted for bound products where physical sheet parity matters for spread layout.
