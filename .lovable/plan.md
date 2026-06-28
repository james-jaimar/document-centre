## What's happening

In `CustomerHeader.tsx` (and `MobileHeader.tsx`) the branch chip is gated by `isMultiBranch`, which is `branches.length > 1`. While branches are loading we show a "Loading branches…" placeholder, then once loaded with a single live branch (e.g. Demo store has only "Demo Branch") the chip disappears entirely — which matches what you're seeing: it flicks up for a second, then vanishes.

## Fix

Always render the branch indicator once an `activeBranch` is resolved, regardless of how many branches exist. Behaviour:

- **Multi-branch tenants**: chip is clickable → opens the branch picker (current behaviour).
- **Single-branch tenants**: chip still renders showing the branch name + pin icon, but is non-interactive (no chevron, no hover affordance, `aria-disabled`). This gives customers a clear "you're shopping at *Demo Branch*" context without offering a meaningless switcher.
- **Loading**: keep the existing "Loading branches…" spinner placeholder.

Applies symmetrically to:
- `src/components/CustomerHeader.tsx` (desktop)
- `src/components/customer/mobile/MobileHeader.tsx` (mobile — currently has no branch chip at all; add the same single/multi-aware chip next to the country flag)

No backend, RLS, or context changes. Footer "Powered by Document Centre" is explicitly out of scope per your message.
