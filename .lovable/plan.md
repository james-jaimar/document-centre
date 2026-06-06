## Plan: clear the phantom Vite error

The overlay says `@/components/ui/sonner` can't be resolved, but the file exists at `src/components/ui/sonner.tsx` and the import in `src/App.tsx` is correct. Nothing in the project is actually broken — this is a stale Vite dev-server cache (common after large unrelated file activity or HMR hiccups).

### Action
1. Restart the Vite dev server (no file changes).
2. Confirm the preview loads cleanly.

If for any reason it doesn't clear, fallback is to nudge `src/App.tsx` (re-save) to force re-resolution — still no real code change.

### Why nothing else is needed
- `src/components/ui/sonner.tsx` is present and unchanged.
- `vite.config.ts` alias `@ → ./src` is intact.
- No other file imports were affected — the overlay only complains about line 3 of `App.tsx`.

Once green, we resume the cutover at **Step 4: lock Cloud Run ingress** (the Edge Function → LB hop was already proven via the `401 edge_no_bearer` smoke test).
