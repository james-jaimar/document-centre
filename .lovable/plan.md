

# Fix Binding Spine Position on Solo Pages + Back Cover Edge-to-Edge

## Two remaining issues

### 1. Binding spine centered on solo page instead of at the edge
Currently `BindingSpine` uses `left: 50%` always. On solo pages where the viewport is only one page wide, this puts the spine in the middle of the page. It should be:
- **Front cover**: spine on the LEFT edge of the page (that's where the binding holes are)
- **Back cover**: spine on the RIGHT edge of the page
- **Spread**: spine in the center (current behavior, correct)

### 2. Back cover card still has white border
`FlipPage` (line 32) always applies `border: 1px solid rgba(0,0,0,0.15)`. For `back_cover_card` pages (solid navy/black card), this creates a visible white edge. The card should be truly edge-to-edge with no border.

## Changes

### File: `src/components/preview/FlipBook.tsx`

**A) Move BindingSpine positioning into FlipBook instead of relying on BindingSpine's internal `left-1/2`**

Pass a new `position` prop or calculate the spine's `left` style in FlipBook based on solo state:
- `isShowingFrontCover` → spine at `left: 0` (left edge of viewport)
- `isShowingBackCover || isShowingLastSolo` → spine at `right: 0` (right edge of viewport)  
- spread → spine at `left: 50%` (center, as now)

**B) Remove border on back_cover_card pages in FlipPage**

In the FlipPage root div (line 32), conditionally remove the `border` when `pageRole === "back_cover_card"`. Keep the inset shadow for other pages.

### File: `src/components/preview/BindingSpine.tsx`

Add a `position` prop (`"left" | "center" | "right"`) that controls horizontal placement instead of always using `left-1/2`. Default to `"center"` for backward compatibility.

