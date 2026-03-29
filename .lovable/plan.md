

# Fix: Restore front_cover blank_back, fix alignment pass instead

## What went wrong

The previous fix removed the `blank_back` after the `front_cover` section to fix tab alignment parity. But that broke the front cover — it's a single-sided cover and **must** have a blank back (the inside of the cover).

The real fix is simpler: **restore the front_cover blank_back** and fix the alignment pass so it doesn't create a visible extra blank before the first tab.

## Root cause (revisited)

With `showCover={true}` and the front_cover blank_back restored:
- idx 0: front_cover (solo RIGHT)
- idx 1: blank_back (LEFT — inside of cover)
- idx 2–7: body pages
- idx 7: tab front lands on ODD = LEFT → alignment pass inserts a blank → extra visible blank

The alignment pass is correct in principle but creates a user-visible blank. The issue is that the blank_back at idx 1 shifts parity.

## The simple fix

The front cover + its blank_back are **two faces** occupying indices 0 and 1. But `showCover={true}` treats index 0 as a solo page outside the normal spread model. So after the cover, the "real" spread model starts at index 1, meaning:
- Odd indices (1, 3, 5…) = LEFT
- Even indices (2, 4, 6…) = RIGHT

This means tabs should land on **even** indices to be on the RIGHT. The current alignment check (`i % 2 !== 0`) is already correct for this. The problem is that with the front_cover blank_back, there's an odd number of faces before the first tab.

**Solution**: In the alignment pass, instead of inserting a visible `blank_back`, simply **don't insert a padding blank when the previous role is already `blank_back`**. The tab is already physically after a completed sheet — the parity is just off by one due to the solo cover. Instead, we should check that the `blank_back` before the front cover already serves as the sheet completion, and the tab naturally follows.

Actually, the simplest approach: **Revert line 110 to restore front_cover blank_back**, then adjust the alignment pass condition to also check `roles[i-1] !== "blank_back"`. If the page before the tab is already a `blank_back`, the physical sheet is complete and no extra padding is needed — the tab can start there even if parity says "left", because the preceding blank_back is the inside of a completed sheet.

Wait — that would put the tab on the LEFT side visually. The parity rule exists because `react-pageflip` literally renders odd indices on the left half of the spread.

Let me think differently. The real issue: with `showCover={true}`, index 0 is solo. Then spreads are [1,2], [3,4], [5,6], etc. So:
- idx 1 = LEFT, idx 2 = RIGHT
- idx 3 = LEFT, idx 4 = RIGHT

So **even = RIGHT** for indices > 0. With blank_back restored after front_cover:

```
idx 0: front_cover (solo)
idx 1: blank_back (LEFT)
idx 2: body p1 (RIGHT)
idx 3: body p2 (LEFT)  [duplex pair]
idx 4: body p3 (RIGHT)
idx 5: body p4 (LEFT)  [duplex pair]
idx 6: body p5 (RIGHT)
idx 7: body p6 (LEFT)  [duplex pair]
idx 8: tab front → EVEN = RIGHT ✓
```

Wait — if the body section is **duplex** (pairs of pages share a sheet, no blank_back inserted), then 6 body pages = 6 faces. Starting at idx 2: indices 2,3,4,5,6,7. So the tab would land at idx 8 = EVEN = RIGHT. **That already works!**

The problem the user originally had must have been with a **simplex** body, where each page gets a blank_back:
- 6 printed pages × 2 faces each = 12 faces, starting at idx 2 through idx 13
- Tab at idx 14 = EVEN = RIGHT ✓

That also works! So why was a blank being inserted? Let me re-check the actual section configuration.

## Need to verify

I need to check what `is_duplex` is set to for the body section in the user's test case, and count the actual faces being generated.

## Plan

1. **Revert line 110**: Remove `&& section.section_type !== "front_cover"` — restore the blank_back after front_cover
2. **Verify**: Count the actual face sequence to confirm tabs land on even indices naturally
3. **If they don't**: The alignment pass already handles it correctly — the issue may be elsewhere

## File to update
- `src/components/order/PreviewPanel.tsx` — line 110: change back to `if (!section.is_duplex)` only

