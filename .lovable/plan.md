<final-text>I confirmed the problem: the database wipe worked, but the storage wipe did not. All the order/document/job tables are now empty, yet Supabase storage still contains the old files your screenshot shows.</final-text>

## What I verified
- Database cleanup succeeded:
  - `orders`, `order_items`, `documents`, `document_sections`, `order_jobs`, `status_history`, `assets`, `derived_files`, and `jobs` all have `0` rows.
- Storage cleanup did not succeed:
  - `document-uploads`: `4,036` objects, about `2004 MB`
  - `documents`: `209` objects, about `94 MB`
- Biggest remaining prefixes in `document-uploads`:
  - `previews`: `1,729`
  - `thumbnails`: `1,729`
  - `normalized`: `395`
  - `outputs`: `158`
  - one legacy asset folder: `25`
- No client code currently calls `wipe-storage`, and there were no matching network requests in the preview, so the function was likely never successfully invoked from the app.

## Root cause
The truncate migration cleared the tables, but storage blobs are separate and still physically exist in Supabase Storage.

The current `wipe-storage` function also has a logic flaw for large folders:
- it lists with `offset`
- deletes that batch
- then increments `offset` on a folder that has now shrunk

That pattern can skip files in large prefixes like `previews` and `thumbnails`.

## Plan
1. Fix `supabase/functions/wipe-storage/index.ts`
   - keep the current platform-admin auth check
   - replace offset-based pagination with a safer loop that always re-lists from `offset: 0` until a prefix is empty
   - add structured per-bucket/per-prefix logging and clearer partial-failure reporting

2. Make the function easier to run reliably
   - add explicit function config if needed for clarity (`wipe-storage` entry in `supabase/config.toml`)
   - keep JWT validation in code using `supabase.auth.getUser()`

3. Run the cleanup properly
   - invoke the fixed edge function with platform-admin auth
   - target all six buckets:
     - `document-uploads`
     - `documents`
     - `previews`
     - `proofs`
     - `uploads`
     - `assets`

4. Verify the result
   - re-check `storage.objects`
   - confirm both large buckets drop to zero objects / near-zero usage
   - if anything remains, use the new logs to identify the exact stuck prefix and rerun only that bucket

## Technical details
- This is now a pure storage problem, not a database problem.
- The remaining files are old test artifacts, with the newest object timestamp around `2026-04-14`.
- Since uploads now go through S3, once this Supabase cleanup is completed, you should stay comfortably under the free-tier storage cap unless something is still writing back into Supabase.