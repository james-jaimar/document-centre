# Fix: anonymous storefront loses its session, so templates and thumbnails 401

## What is actually happening

Every failing call in your console ends at the same place: the `s3-storage` edge function requires a signed-in user (including anonymous users) and returns 401 when there is none. The browser is calling it with only the publishable key, which is why the Supabase auth log shows repeated `403 invalid claim: missing sub claim` on `/user` at exactly the same timestamps.

Why there is no session (confirmed in code and in the auth log):

- The auth log shows a **logout at 08:12:03**, then the 401 storm begins at 08:12:20.
- `CustomerLayout` deliberately suppresses recreating an anonymous session for 30 seconds after a tenant sign-out (`hasTenantSignOutFlag`).
- In that suppressed branch it also sets `bootstrapAttempted.current = true`, which is a permanent latch for the life of the page. The effect never runs again, so once the 30 seconds pass nothing recreates the anonymous session. The customer browses with **no session at all** until a full reload.

Result: thumbnails can't sign, the template base PDF can't download, and the builder shows "Could not load this layout. Please try another."

## The fix

**1. Don't latch the bootstrap when it was only deferred**

In `src/components/CustomerLayout.tsx`, when the sign-out flag is present, return **without** setting `bootstrapAttempted`, and schedule a re-check when the flag expires (short timer, or re-run the effect on a tick) so the anonymous session is created as soon as suppression ends. Only set the latch when a bootstrap was genuinely attempted or a user exists.

**2. Self-heal at the storage layer**

In `src/lib/s3Storage.ts`, when a call has no access token (or the edge function returns 401), attempt a one-shot anonymous sign-in for the current tenant slug and retry once, instead of throwing "No active session". This makes every consumer (thumbnails, template PDF fetch, uploads) recover on its own rather than surfacing a red toast.

**3. Honest failure text in the builder**

`TemplatedArtworkBuilder` / `TemplatePickerSheet`: if the layout still can't load after the retry, say the session expired and offer a "Reload" action, rather than "Please try another" (which sends people to layouts that will fail identically).

## Technical notes

- Files touched: `src/components/CustomerLayout.tsx`, `src/lib/s3Storage.ts`, `src/pages/dashboard/TemplatedArtworkBuilder.tsx`, `src/components/artwork/TemplatePickerSheet.tsx`.
- No edge function change: `s3-storage` requiring a user is correct — anonymous Supabase users satisfy it, so the fix is to make sure one always exists.
- No database or RLS change.
- Verification: sign out on a tenant storefront, wait past 30s, open a templated-artwork product; the layout and all thumbnails must render with zero 401s in the network log.
