## What's happening (verified in code)

In `src/pages/dashboard/PhotoPrintsBuilder.tsx`:

1. `const [photoSpec, setPhotoSpec] = useState(initialSpec)` (line 181) captures `initialSpec` on the **first render**, before the catalogue options query has resolved. At that moment `availableSizes` / `availableFinishes` are empty, so the state is seeded with the hardcoded fallbacks: `print_size_slug: ""`, `finish_slug: "gloss"`, `border_slug: "none"`.
2. When the catalogue loads, `initialSpec` recomputes but nothing re-syncs the state (the hydration effect at line 184 only runs for an existing saved order item). So:
   - **Finish** stays `"gloss"`, which is not one of the catalogue value slugs (the bridge builds finishes from the "Finish" product option's own slugs), so the Select renders empty even though a default exists.
   - **Print size** stays `""`, which then trips the stale-size auto-correct effect (lines 371-379) → the `Print size updated — previous size is no longer available` toast on every fresh visit.

So it isn't a bad default stored anywhere in admin — it's a client-side initialisation race.

## Fix

Single file: `src/pages/dashboard/PhotoPrintsBuilder.tsx`.

1. **Seed defaults once the catalogue arrives.** Add a `defaultsAppliedRef`; in an effect that runs when `availableSizes` / `availableFinishes` / `availableBorders` become non-empty and no saved order item has been hydrated, set `print_size_slug`, `finish_slug`, `border_slug` from the resolved defaults (catalogue `is_default`, else first entry). Only for fields that are currently empty or not present in the resolved list, so a user's explicit choice is never overwritten.
2. **Self-heal Finish and Border the same way size already is** — if the current slug isn't in the available list, fall back to the default silently (no toast) rather than leaving the Select blank.
3. **Only toast for a genuinely stale size.** Suppress the "Print size updated" info toast when the previous slug was empty/never chosen (initial load) or when no photos have been added yet; keep it for the real case where an admin removed a size the customer had already selected.
4. Keep the existing hydration path for saved order items unchanged; make sure the new default-seeding effect defers to it (don't overwrite a hydrated spec).

## Technical notes

- Prefer resolving defaults via a small `useMemo` that returns `{ sizeSlug, finishSlug, borderSlug }` from the bridged lists, and reuse it in both the seeding effect and the self-heal checks — no duplicated fallback logic.
- No database or admin-config changes are needed; the catalogue defaults are already correct.
