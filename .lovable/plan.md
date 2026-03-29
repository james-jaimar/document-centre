

# Fix Unnecessary Blank Page Before Tab/Insert

## Problem

When a tab is placed "after page 6" in a simplex document, `buildPageSequence` already inserts a `blank_back` after page 6 (the physical back of that sheet). The tab front should naturally follow on the next RIGHT-side index. But the post-processor blindly checks if the tab front is at an odd index and injects **another** blank — creating a visible empty page that shouldn't exist.

The sequence should be:
```text
... page6(RIGHT) → blank_back_of_6(LEFT) → tab_front(RIGHT) → tab_back(LEFT) ...
```

But currently it produces:
```text
... page6(RIGHT) → blank_back_of_6(LEFT) → EXTRA_BLANK(RIGHT) → tab_front(LEFT?!) ...
```

## Root cause

The post-processing alignment pass in `PreviewPanel.tsx` (lines ~217-240) doesn't account for the fact that a preceding `blank_back` already provides correct sheet-boundary alignment. It just checks `index % 2 !== 0` and inserts a blank, which can actually **break** the alignment rather than fix it.

## Fix

In the post-processing loop, before inserting a `blank_back` to fix alignment, check whether the **previous** page is already a `blank_back`. If it is, the tab/insert is already correctly positioned after a sheet boundary — skip the insertion.

Specifically, change the condition from:
```
if (PHYSICAL_FRONT_ROLES.has(roles[i]) && i % 2 !== 0)
```
to also require:
```
&& roles[i - 1] !== "blank_back"
```

If the preceding role is `blank_back`, the physical sheet's back face is already there — no padding needed.

## File to edit

- `src/components/order/PreviewPanel.tsx` — update the post-processing alignment condition (~line 228)

## Expected result

- Tab after page 6: page 6 (right), back of 6 (left), tab front (right), tab back (left) — no extra blank
- Alignment still works correctly for cases where there's no preceding blank_back

