

# Fix: Remove extra blank page before first tab

## Root cause

With `showCover={true}` in react-pageflip, index 0 is a solo right page, then spreads follow as [1,2], [3,4], etc. — meaning **even indices = RIGHT**, **odd indices = LEFT**.

The face sequence before the first tab looks like this (front_cover section is simplex, body section is duplex):

```text
idx 0: front_cover     (solo RIGHT)
idx 1: blank_back      (LEFT)  ← simplex reverse of front cover
idx 2: body p2          (RIGHT)
idx 3: body p3          (LEFT)
idx 4: body p4          (RIGHT)
idx 5: body p5          (LEFT)
idx 6: body p6          (RIGHT)
idx 7: tab_front        ← ODD = LEFT — WRONG!
```

The alignment pass sees the tab at an odd index and inserts a blank to push it to even. This fixes the display side but creates a visible blank page the user doesn't want.

Tabs 2 and 3 work because the alignment blank (+1) plus the tab sheet (+2) = 3 faces added, which flips the parity so subsequent tabs naturally land on even.

## Fix

**Skip the `blank_back` after `front_cover` sections in bound documents.** The `showCover={true}` already renders the front cover as a solo page. Its "inside" is implicit — it doesn't need a separate face in the sequence.

This makes the face count before the first tab even:

```text
idx 0: front_cover     (solo RIGHT)
idx 1: body p2          (LEFT)
idx 2: body p3          (RIGHT)
idx 3: body p4          (LEFT)
idx 4: body p5          (RIGHT)
idx 5: body p6          (LEFT)
idx 6: tab_front        ← EVEN = RIGHT ✓
idx 7: tab_back         ← ODD = LEFT ✓
```

The alignment pass won't trigger because the tab is already at an even index. No padding blank needed.

## Implementation

### File: `src/components/order/PreviewPanel.tsx`

In `buildPageSequence()`, change the simplex blank_back insertion (around line 110) to also skip `front_cover` sections:

```typescript
// Current:
if (!section.is_duplex) {
  result.push({ /* blank_back */ });
}

// Change to:
if (!section.is_duplex && section.section_type !== "front_cover") {
  result.push({ /* blank_back */ });
}
```

This is a one-line condition change. The alignment pass remains as-is for edge cases where other sections might cause parity issues.

## Expected result

- Tab 1: no blank before it, appears on the RIGHT side
- Tabs 2, 3: still correct on the RIGHT side (parity preserved)
- Insert sheets: still correct
- Front cover: still displays as solo page via `showCover={true}`

