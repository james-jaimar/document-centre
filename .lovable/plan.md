

# Fix Scrollbar Flickering on FlipBook Hover

## Problem

When hovering over the page corners of the flip book, react-pageflip's corner-peel animation slightly expands the rendered area beyond the container bounds. This triggers scrollbars on the parent container, which then changes the container size (detected by ResizeObserver), which triggers a re-render, causing a flickering loop.

## Solution

Two simple overflow fixes:

### 1. `src/components/preview/FlipBook.tsx`

Add `overflow: hidden` to the outer wrapper div (line 102) and the inner div that holds the HTMLFlipBook (line 103). This clips the corner-peel effect to the container bounds, preventing any size expansion.

### 2. `src/components/order/PreviewPanel.tsx`

Add `overflow-hidden` to the container div measured by ResizeObserver (line 180). This ensures even if the flip book tries to push beyond bounds, no scrollbar appears on the preview panel itself.

## Files to edit

1. **`src/components/preview/FlipBook.tsx`** — Add `overflow: hidden` to the two container divs
2. **`src/components/order/PreviewPanel.tsx`** — Add `overflow-hidden` class to the measured container

