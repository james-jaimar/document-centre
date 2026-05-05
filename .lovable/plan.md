
## Carousel with arrows for the product picker

Replace the bare `overflow-x-auto` horizontal scroll with a proper carousel that has left/right arrow buttons and hides the scrollbar.

### What changes

**`src/pages/dashboard/CustomerDashboard.tsx`**
- Wrap the product list in a carousel container with `useRef` for the scroll container
- Add left/right `ChevronLeft`/`ChevronRight` arrow buttons positioned at the edges of the container
- Track scroll position with a scroll listener to show/hide arrows when at the start or end
- Clicking an arrow scrolls by one "page" width (smooth scroll)
- Hide arrows on mobile (touch scrolling is natural there)
- Hide the native scrollbar via CSS

**`src/index.css`**
- Add a `.hide-scrollbar` utility class (`::-webkit-scrollbar { display: none }` + `scrollbar-width: none`)

### Behaviour
- Left arrow hidden when scrolled to the start
- Right arrow hidden when scrolled to the end
- Arrows are semi-transparent circular buttons with a subtle backdrop blur, matching the glassmorphic style
- Smooth scroll animation on click
- On mobile/touch devices, natural swipe scrolling works as before (arrows hidden below `md` breakpoint)
