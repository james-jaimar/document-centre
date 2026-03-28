

# Fix Page Edge Visibility — Drop Shadow Not Showing

## Problem

The `box-shadow` on line 32 of `FlipPage` is being clipped. `react-pageflip` wraps each page in its own container with `overflow: hidden`, so any outward shadow is invisible. The shadow needs to be applied differently.

## Solution

Instead of an outward `box-shadow` (which gets clipped), use an **inset shadow** combined with a faint **border** on the FlipPage root div. This creates a visible edge definition that stays within the element bounds and can't be clipped.

### File: `src/components/preview/FlipBook.tsx`

Replace the current `boxShadow` on the FlipPage root div (line 32) with:

```typescript
border: "1px solid rgba(0,0,0,0.08)",
boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.06)"
```

The `border` gives a crisp, visible edge that distinguishes white paper from white background. The `inset` shadow adds a subtle inner depth. Neither can be clipped by the parent's `overflow: hidden`.

### Additionally: outer container shadow

Add a `box-shadow` to the `HTMLFlipBook` wrapper div (line 168) — this div is NOT clipped by react-pageflip, so a standard drop shadow here will frame the entire book spread:

```typescript
boxShadow: "0 2px 8px rgba(0,0,0,0.10)"
```

## Files to edit

1. **`src/components/preview/FlipBook.tsx`** — Change FlipPage shadow to border + inset; add outer shadow to the book container div

