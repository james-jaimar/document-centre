

# Fix Tab/Insert Physical Alignment + Tab Sizing & Color

## Three problems

### 1. Tabs/inserts landing on wrong side of spread
In `react-pageflip` with `showCover={true}`, page indices work like this:
- Index 0: front cover (solo, RIGHT side)
- Index 1: LEFT side, Index 2: RIGHT side
- Index 3: LEFT side, Index 4: RIGHT side
- etc.

A tab or insert is a physical sheet. Its front face MUST land on a RIGHT-side page (even index). Currently `buildPageSequence` just appends tab/insert pages wherever they fall, which can put the front face on a LEFT-side index — splitting the physical sheet across a spread.

**Fix**: Post-process the page array. After building all pages, scan for any `tab` or `insert` role at an odd index. If found, insert a `blank_back` page before it to push it to an even index. This guarantees every physical divider/insert starts on the right side.

### 2. Tab color ignores user selection
`TabOverlay` uses the hardcoded `TAB_COLORS` palette (red, blue, green, yellow, orange) regardless of what the user selected. If user picks "white" tabs, they should be white/light gray — not red.

**Fix**: Use the `color` field from `TabPosition` (which comes from the section's color). Only fall back to `TAB_COLORS` if the color is empty AND the tab option is multi-color. For white/single-color tabs, use the actual color.

### 3. Tab height doesn't follow banking rules
User specified: tab height = page height / tab count. Max 10 tabs per bank. If > 10, split into banks (e.g., 12 tabs → 2 banks of 6). Tabs 1-6 top-to-bottom, tabs 7-12 top-to-bottom in a second column offset slightly inward.

**Fix**: In `TabOverlay`, calculate `banks = ceil(tabTotal / 10)`, `bankSize = ceil(tabTotal / banks)`. Each tab's vertical position = `(indexWithinBank / bankSize) * pageHeight`. Second bank tabs render slightly inward (offset by tabWidth).

## Files to edit

- **`src/components/order/PreviewPanel.tsx`** — add post-processing pass after `buildPageSequence` to ensure tab/insert front faces land on even indices
- **`src/components/preview/FlipBook.tsx`** — fix `TabOverlay` to use section color instead of hardcoded palette; implement banking logic for tab height calculation

## Expected result

- Tab and insert front faces always appear on the RIGHT side of a spread
- White tabs render as white/light gray, not red
- 5 tabs = page height / 5 each; 12 tabs = 2 banks of 6
- No more "breaking the laws of physics" with sheets split across spreads

