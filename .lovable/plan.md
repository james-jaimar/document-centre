# Fix: "null value in column id" when saving a new text box

## Confirmed cause

- The error comes from saving placeholders, not from drawing the box.
- `useSaveArtworkPlaceholders` (src/hooks/useArtworkTemplates.ts) builds one array where existing rows include `id` and brand-new rows omit it, then sends them all in a single `upsert(..., { onConflict: "id" })`.
- PostgREST normalises a bulk payload to a common column list, so rows that omit `id` are sent as `id: null`.
- The database column is `id uuid NOT NULL DEFAULT gen_random_uuid()` (verified). A default only applies when the column is absent — an explicit `null` fails the not-null constraint. So the first save after adding any new box (image or text) fails.

## Change

In `useSaveArtworkPlaceholders`:

1. Split the rows into two groups:
   - **New** rows (`id` starts with `new-`): strip `id` entirely and `insert` them, letting the database generate UUIDs.
   - **Existing** rows: keep `id` and `upsert` with `onConflict: "id"` as today.
2. Run the delete of removed rows first (unchanged), then the update batch, then the insert batch.
3. Surface any error to the caller so the editor's toast shows the real message.

No schema change and no RLS change are needed.

## Technical notes

- Touched file: `src/hooks/useArtworkTemplates.ts` only.
- Sort order stays index-based across the combined list so box ordering is preserved.
