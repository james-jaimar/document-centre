# Two small fixes for the customer portal

## 1. Flash of unbranded UI on slow connections

**What's happening today**
`CustomerLayoutInner` renders the full header / sidebar / footer immediately, then injects tenant CSS variables (`--tenant-primary`, fonts, logo) only once `useTenantBranding` resolves. On a slow connection that means the customer sees the default Document Centre theme (white header, default font, no logo) for a beat before PostNet red overlays it. Today we already track `brandingReady`, but only use it to fade the sidebar — the header and main area still paint unbranded.

**Fix**
Gate the entire layout behind `brandingReady` and show a minimal full-screen splash in the meantime:

- Neutral background (`bg-background`) with a centered subtle spinner.
- If `tenant?.logo_url` (or the value extracted from `branding.header_html`) is already known from the cached tenant fetch, render it above the spinner so the brand is the first paintable thing.
- Once `brandingReady` flips to true, render the real layout. CSS variables are already in `tenantStyle`, so the first paint of the real header is fully branded.

Branding query is already cached by react-query, so repeat visits are instant — this only affects cold loads.

## 2. Branch picker can't be re-opened after a store is selected

**Root cause**
`BranchContext.showPicker` is computed as:

```ts
showPicker: pickerOpen && isMultiBranch && !urlBranchSlug
```

As soon as the customer lands on `/sandton-city`, `BranchSlugRoute` calls `setUrlBranchSlug("sandton-city")`. From that point `urlBranchSlug` is truthy, so `showPicker` is forced to `false` even when the header's branch chip calls `openPicker()`. That's why clicking "PostNet Sandton City" in the top bar does nothing.

**Fix**
The `!urlBranchSlug` guard was only there to stop the picker from auto-opening on initial load when the URL already names a branch. The auto-open logic in the resolver `useEffect` already handles that case (it returns early when `urlBranchSlug` is set), so the guard on `showPicker` is redundant and harmful.

Change the derived value to:

```ts
showPicker: pickerOpen && isMultiBranch
```

Result: the picker stays closed on initial load (because nothing calls `openPicker`), but `openPicker()` from the header chip now actually opens it. Selecting a different branch then navigates to its URL via the existing `BranchPicker` `handleSelect`, which updates the URL slug and re-resolves the active branch.

## Files to touch

- `src/contexts/BranchContext.tsx` — drop `!urlBranchSlug` from `showPicker`.
- `src/components/CustomerLayout.tsx` — render a tenant-aware splash while `!brandingReady`, then mount the real layout.

No backend, no schema, no routing changes.
