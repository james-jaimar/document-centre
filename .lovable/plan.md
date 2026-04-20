
## Bug

Customer card in sidebar shows `james_b_hawkins` (their email local-part) instead of a real name. Confirmed in DB:
```
email: james_b_hawkins@me.com
display_name: "james_b_hawkins"   ← seeded from email at signup
first_name: null, last_name: null
```

Two distinct issues:

1. **Bad data at source** — `supabase/functions/request-signup/index.ts` (lines 75, 100) seeds `display_name = email.split("@")[0]` whenever no name is supplied. This contaminates the profile permanently with a fake name that wins over `first_name`/`last_name` later.
2. **Inconsistent display logic** — `CustomerSidebar.tsx` only selects `display_name` (no first/last), and `AdminCustomerDetail` / `AdminCustomers` prefer `display_name` ahead of `first_name + last_name`, so even if the customer fills in their real name later, the seeded value still wins.

The other places already do it correctly (`PlatformUsers`, `MembersTable`, `AdminBranchDetail`, `EditMemberDialog`, `AddCustomerDialog`, `useCart` checkout payload): **first_name + last_name → display_name → email-localpart → "User"**.

## Fix

### A. Stop seeding fake display names

`supabase/functions/request-signup/index.ts`:
- Line 75: `user_metadata: { display_name: display_name || null, tenant_slug }`
- Line 100: only set `display_name` if explicitly provided — otherwise insert with `display_name: null`.

This way, signup leaves the field blank and downstream UI falls through to email-localpart only when nothing better exists.

### B. Standardise the display-name resolver

Create `src/lib/displayName.ts` with one helper everyone uses:
```ts
export function resolveDisplayName(p: {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  email?: string | null;
}, fallback = "User"): string {
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (p.display_name?.trim()) return p.display_name.trim();
  if (p.email) return p.email.split("@")[0];
  return fallback;
}
```

### C. Apply it everywhere customer/user names are shown

Update these files to use `resolveDisplayName` (and ensure their queries select `first_name, last_name, email` alongside `display_name`):

- `src/components/CustomerSidebar.tsx` — extend SELECT, swap fallback chain.
- `src/pages/admin/AdminCustomerDetail.tsx` — reorder chain (currently puts `display_name` first).
- `src/pages/admin/AdminCustomers.tsx` — reorder chain.
- `src/pages/platform/PlatformUsers.tsx`, `src/components/admin/MembersTable.tsx`, `src/pages/admin/AdminBranchDetail.tsx`, `src/components/admin/EditMemberDialog.tsx`, `src/components/admin/AddCustomerDialog.tsx` — already correct, just refactor to call the shared helper for consistency.

### D. Backfill the existing bad row(s)

One-off DB update: clear `display_name` on profiles where `display_name = split_part(email, '@', 1)` AND (`first_name IS NULL` AND `last_name IS NULL`) — i.e. only the auto-seeded ones, leaving deliberate display names alone:
```sql
UPDATE profiles
SET display_name = NULL
WHERE display_name IS NOT NULL
  AND display_name = split_part(email, '@', 1)
  AND first_name IS NULL
  AND last_name IS NULL;
```
(Migration file.)

### E. Order records — already-placed orders

`orders.customer_name` is snapshotted at place-order time from the same chain (see `useCart.ts` line 522). It's already correct (first+last → display_name → null), so new orders will be fine. Existing past orders with the bad `customer_name = "james_b_hawkins"` are immutable financial snapshots — leave them alone (consistent with our financial-immutability rule). They'll heal naturally as the customer places new orders after filling in their name.

## Verification

1. Sidebar for `james_b_hawkins@me.com`: with first/last still null and display_name backfilled to NULL → shows `james_b_hawkins` (email-localpart fallback). After they enter "James Hawkins" in My Account → shows "James Hawkins" everywhere immediately.
2. Admin → Customers list and Customer detail show "James Hawkins" once names are filled.
3. New signup with no name supplied: profile row has `display_name = NULL` (not the email local-part).
4. New OAuth signup: still gets `display_name` from Google's `full_name` (oauth-callback unchanged — that path is fine, it uses real provider data).
5. New order placed by James: `orders.customer_name = "James Hawkins"` (not the email).

## Out of scope

- Rewriting historical `orders.customer_name` (immutable snapshots).
- Adding a profile-completion nudge on first login (nice future).
