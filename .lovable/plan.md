# Fix "Not authenticated" when uploading in the demo store

## What actually happened

The message is not about S3. "Failed to create order — Not authenticated" comes
from the order-creation step, which runs before any file reaches storage. It
fires when the browser has no signed-in visitor at that moment — the demo store
signs every visitor in silently as a guest, and at the moment you dropped the
file that guest session was not there.

What the records show (checked, not assumed):

- Guest sign-in itself is working at the server: guest visitors were created
  today, including three for the demo store within two seconds of each other at
  14:52, just before you hit the error.
- Three near-simultaneous guest sign-ins for one shop is the suspicious part.
  Each sign-in replaces the browser's stored session, so two of them race and
  the browser can end up holding a session that has already been replaced —
  which the login library then discards, leaving no visitor at all.
- Whether that race is exactly what bit you is **not yet confirmed**. That is
  the first step below.

## Plan

1. **Confirm the cause.** Reproduce a demo-store visit and watch the guest
   sign-in calls and the stored session, including the case where the shop is
   open in more than one tab or surface at once. Only proceed once the sequence
   that empties the session is seen.

2. **Only ever start one guest session at a time.** Make guest sign-in
   single-flight: a shared in-progress promise plus a short cross-tab lock, with
   a fresh session check taken inside the lock. Concurrent page mounts or tabs
   wait for the first sign-in instead of starting their own.

3. **Recover instead of failing.** When an upload finds no visitor, re-establish
   the guest session and retry once, rather than throwing "Not authenticated".
   Only if that recovery also fails does the customer see a message — and it
   says what to do ("Your session expired, please refresh") instead of a
   developer term.

4. **Keep the sign-out behaviour intact.** A customer who has just signed out
   must still not be silently signed back in as a guest; the recovery path
   respects the existing sign-out flag.

5. **Verify.** Upload into the demo store in a single tab, in two tabs at once,
   and immediately after a hard refresh — the file uploads every time and no
   duplicate guest visitors are created for one visit.

## Technical notes

- Toast source: `OrderFiles.tsx` `handleFiles` → `ensureOrder()`; throw site is
  `useCreateOrder` in `src/hooks/useOrderBuilder.ts` (`if (!user) throw new
  Error("Not authenticated")`).
- Guest bootstrap lives in `src/components/CustomerLayout.tsx` (effect guarded
  only by a per-mount `bootstrapAttempted` ref) and `src/pages/Try.tsx`. Extract
  it into one helper, e.g. `src/lib/guestSession.ts`, exporting
  `ensureGuestSession(slug)` with the single-flight lock; both call sites use it.
- `useCreateOrder` gains a fallback: on missing `user`, call
  `ensureGuestSession`, re-read `supabase.auth.getUser()`, and use that id.
- No database, RLS, storage or edge-function changes; `signInAnonymously` stays
  the mechanism, it is just serialised.

## Out of scope

No change to S3, the storage proxy, or upload size/format rules — those are
working; the failure is earlier in the flow.
