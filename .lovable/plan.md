# Fix the "window inside a window" storefront shell

## What you're seeing

The customer/storefront shell is built as a fixed-height app frame rather than a normal web page:

- `src/components/CustomerLayout.tsx` renders the root as `flex h-screen w-full flex-col` — the shell can never be taller than the browser window.
- Inside it, the content column is `flex flex-1 flex-col overflow-hidden`, and `<main>` switches between `overflow-auto` (portal pages) and `overflow-hidden` (storefront + artwork editor, via `chromeless`).
- The footer lives inside that inner column, so it sits below an internal scroll region instead of at the end of the document.

Net effect: the page scrolls in an inner pane while the browser's own scrollbar does nothing — the nested window look in your screenshot. It also explains the "stuck layout" symptom: the inner scroller keeps its own scroll offset and height between route changes, so navigating in and out (especially between a chromeless route like the artwork editor and a normal page) can leave the pane scrolled or sized wrong until you resize or hard-reload.

For a shop, this is not the right model. Shop and portal pages should scroll like a normal page. Only the artwork/template editor genuinely needs a locked, non-scrolling viewport.

## What to change

1. **Normal document scrolling for storefront and portal pages**
   - Root becomes `min-h-screen` (not `h-screen`), no `overflow-hidden` on the content column.
   - `<main>` drops `overflow-auto` / `overflow-hidden` for these routes; the browser window becomes the single scroll container.
   - Footer moves into normal document flow so it lands at the bottom of the content, not below an inner pane.

2. **Keep the editor locked**
   - Only `editorMode` (`/custom-artwork`) keeps the fixed `h-screen` + `overflow-hidden` treatment, so the A2 deskpad / calendar editors still fit the viewport exactly as they do now.
   - `storefrontMode` stops implying "chromeless height lock"; it keeps meaning "no sidebar, full-bleed shop styling".

3. **Sticky header instead of frame-pinned header**
   - With page scrolling, make the header (and brand strip / branch picker order) `sticky top-0` with a z-index so it behaves as it does today while the page scrolls under it.

4. **Scroll reset on navigation**
   - Add a scroll-to-top on route change for the customer shell, so moving between shop, product, cart and account pages always starts at the top instead of inheriting a stale offset.

5. **Mobile shell check**
   - Verify `CustomerMobileLayout` doesn't reintroduce its own inner scroller now that the window scrolls; align it the same way if it does.

## Verification

- Long shop/category page: only one scrollbar, footer at the true bottom, header sticky.
- Product page → editor → back to shop → cart: no stuck/blank region, no frozen scroll pane.
- Artwork editor still fits the viewport with its own internal panels.
- Mobile viewport: bottom tab bar and page scroll behave normally.

## Files touched

- `src/components/CustomerLayout.tsx` (main change)
- `src/components/CustomerHeader.tsx` (sticky positioning)
- `src/components/CustomerMobileLayout.tsx` (only if it duplicates the inner scroller)
