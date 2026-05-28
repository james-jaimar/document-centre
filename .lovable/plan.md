# Show cart access to anonymous shoppers

## Problem
Anonymous (guest) customers can add items to the cart, but the header hides the cart icon and "Cart" nav link until they sign in. They have no way back to their cart without first adding another product from a page that links to it — confusing and a likely drop-off point.

Per the project's guest-checkout boundary, `/t/:slug` is public and auth only happens inline at checkout, so cart browsing must work while anonymous.

## Changes

### 1. `src/components/CustomerHeader.tsx` (desktop)
- Add `Cart` to `publicNavItems` so the centre nav shows: Home · Create · Cart.
- Render the cart icon (with badge) in `renderRightControls()` for **both** authenticated and anonymous users. Keep "Sign In" button to the right of it for anonymous users; keep avatar dropdown for authenticated users.

### 2. `src/components/customer/mobile/MobileHeader.tsx` (mobile top bar)
- The cart icon is already rendered unconditionally — verify and leave as-is. (Already correct based on current file.)

### 3. `src/components/customer/mobile/MobileNavSheet.tsx` (mobile hamburger menu)
- Read this file and ensure Cart appears in the guest nav list too (parallel to desktop change).

## Out of scope
- No changes to cart logic, `useCart`, anonymous session bootstrap, or auth boundary — purely surfacing the existing cart route in nav for guests.
