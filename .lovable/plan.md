
## Problem

When visiting `/t/postnet`, the page shows a spinner with "Setting up your session…" that never goes away.

**Root cause**: In `CustomerLayout.tsx`, the anonymous bootstrap effect has a race condition. When `signInAnonymously()` succeeds, Supabase fires `onAuthStateChange` which updates `user` in the `useAuth` hook. This causes React to re-run the effect, which sets `cancelled = true` via the cleanup function. The original async function's `finally` block checks `if (!cancelled) setBootstrapping(false)` --- but `cancelled` is now `true`, so `bootstrapping` is **never set back to false**, leaving the spinner permanently.

## Plan

### 1. Fix the race condition in `CustomerLayout.tsx`

- In the `finally` block, **always** call `setBootstrapping(false)` regardless of `cancelled`. The `cancelled` flag should only gate state updates that would conflict with a newer run (like setting stale data), but clearing a loading flag is always safe.

### 2. Remove the blocking spinner entirely

Per the user's feedback ("we shouldn't show that to the client"), the bootstrap should happen **transparently in the background**:

- Remove the `if (bootstrapping) return <Loader2 .../>` gate entirely.
- Let the layout render immediately (header, sidebar, content area) while the anonymous session is being created.
- The child pages (e.g. `CustomerDashboard`) should gracefully handle a missing user for the ~500ms it takes to bootstrap --- they already show their own loading states via react-query.

### 3. Remove the artificial 400ms delay

The `await new Promise(r => setTimeout(r, 400))` after `signInAnonymously` was copied from the `/try` page. The `tenant-bootstrap` edge function is already idempotent and handles the case where the trigger hasn't finished yet, so this delay is unnecessary and adds latency.

### Files changed
- `src/components/CustomerLayout.tsx` --- fix the race, remove spinner gate, remove 400ms delay
