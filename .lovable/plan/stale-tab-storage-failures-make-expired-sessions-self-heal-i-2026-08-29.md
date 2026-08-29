# Stale-tab storage failures: make expired sessions self-heal instead of showing an error

## What I verified in the code

- The toast text "Could not load this layout. Please try another." comes from one place: the template render effect in `TemplatedArtworkBuilder.tsx`. It fires whenever `downloadFromS3(template.base_pdf_path)` throws.
- `downloadFromS3` in `src/lib/s3Storage.ts` reads the current access token and calls the `s3-storage` Edge Function with it.
- `s3-storage` validates the caller with `supabase.auth.getUser()` and returns **401 Unauthorized** when the token isn't valid.
- The retry helper in `s3Storage.ts` only retries "transient" failures: 408/425/429/5xx and network blips. **401 and 403 are treated as permanent — no retry, straight to the error toast.**

## Unconfirmed part (first step of the work)

The most likely trigger for your open-tab case is an access token that had expired/was mid-refresh while the tab was backgrounded, so the first request after refocus went out with a dead token (401) and the immediate second attempt succeeded once the refresh landed. I have not yet captured a log proving this, so step 1 is to confirm it before assuming it.

## Plan

1. **Confirm the failure code**
   - Add a one-line diagnostic log in `downloadFromS3`'s error path recording the HTTP status and whether a token was present, then reproduce by leaving a builder tab idle past token expiry.
   - Only proceed with the auth-specific handling below if 401/"No active session" is what we actually see; if it's something else, fix that instead.

2. **Treat auth failures as recoverable, once**
   - In `src/lib/s3Storage.ts`, when a storage call fails with 401/403 or there is no access token, call `supabase.auth.refreshSession()` (or re-read the session) once and retry the same request.
   - Applies to the shared call path so it covers downloads, signed URLs, uploads, copy and delete — every consumer (`TemplatedArtworkBuilder`, `UploadedArtworkBuilder`, `CanvasPrintsBuilder`, admin proof/gallery) benefits.
   - No new sign-in logic and no anonymous user creation here — `CustomerLayout` stays the sole owner of session creation, as established previously.

3. **Only show an error if the retry also fails**
   - Keep the existing toast wording for genuine failures, but it should no longer appear for a recoverable expired token.
   - If the refresh itself fails (session truly gone), show a clear message with a "Reload" action rather than "try another layout", which sends people to layouts that will fail identically.

4. **Verify**
   - Leave a templated-artwork tab open past token expiry, return to it, and confirm the layout renders with no toast and at most one silent refresh+retry in the network log.
   - Confirm no repeated refresh loops and no extra anonymous sign-ups in the auth log.
   - Re-check a normal fresh load and an admin proof view to confirm nothing regressed.

## Technical scope

Frontend only: `src/lib/s3Storage.ts` (auth-aware retry) and `src/pages/dashboard/TemplatedArtworkBuilder.tsx` (error wording/action). No Edge Function, database, RLS or S3 policy changes — `s3-storage` requiring a valid user is correct.
