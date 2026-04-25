## Root cause

The browser console error is unambiguous:

```
Access to fetch at '.../functions/v1/s3-storage' from origin 'https://document-centre.com'
has been blocked by CORS policy: Response to preflight request doesn't pass access control check:
It does not have HTTP ok status.
```

This is **not** an S3 bucket CORS issue (my earlier guess was wrong — sorry). It's a CORS misconfiguration on the **`s3-storage` Supabase edge function itself**.

### Why it fails for some users and not others

`@supabase/supabase-js@2.99.1` (the version pinned in this project) sends these extra headers on every `functions.invoke()` call:

- `x-supabase-client-platform`
- `x-supabase-client-platform-version`
- `x-supabase-client-runtime`
- `x-supabase-client-runtime-version`

The browser's CORS preflight (`OPTIONS`) asks the server *"are these headers allowed?"* via `Access-Control-Request-Headers`. The current `s3-storage` function only declares:

```
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
```

Because the four `x-supabase-client-*` headers aren't in that list, **the browser rejects the preflight client-side** — the request never even reaches the edge function (which is why the function logs are empty for these failed attempts). It works intermittently when:
- An older Supabase client is cached
- The browser has a still-valid cached preflight from before the SDK upgrade
- Some corporate proxies strip the headers

Fresh Chrome on Mac in the UK has none of those — so it fails 100%.

### Confirmation

8 of our 20 edge functions have the same incomplete header list. The other 12 (e.g. `order-engine`, `pdf-api`, `document-access`, `manage-user`) already include the full set and have been working fine — that's why only S3 uploads fail and not the rest of the app.

## Fix

Update `Access-Control-Allow-Headers` on the affected functions to include the full header set:

```ts
"Access-Control-Allow-Headers":
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version"
```

Files to update (all CORS-only, no logic changes):

1. **`supabase/functions/s3-storage/index.ts`** ← the actual upload blocker
2. `supabase/functions/wipe-storage/index.ts`
3. `supabase/functions/email-dispatcher/index.ts`
4. `supabase/functions/request-password-reset/index.ts`
5. `supabase/functions/request-signup/index.ts`
6. `supabase/functions/scrape-branding/index.ts`
7. `supabase/functions/email-account-manage/index.ts`
8. `supabase/functions/cleanup-stale-drafts/index.ts`

Edge functions auto-deploy on save, so the UK user just needs to retry the upload immediately after — no S3/AWS console changes, no env var changes, no client redeploy needed (although the client picks up nothing new anyway).

## What this does NOT touch

- S3 bucket CORS — not the issue (presigned PUT to S3 never happens because the preflight to the edge function fails first)
- Frontend code (`src/lib/s3Storage.ts`, `usePhotoUpload.ts`, `FileUploader.tsx`)
- The supabase-js version
- Any business logic in any edge function

## Verification after deploy

1. Ask the UK user to hard-refresh (Cmd-Shift-R) and retry the upload.
2. I'll then check `s3-storage` edge function logs — we should now see the `sign-upload` call land successfully (we currently see nothing for failed attempts because preflight blocks them).
3. If presigning succeeds but the actual S3 PUT then fails, we'd revisit S3 bucket CORS — but I do not expect that based on the evidence (other users in SA upload fine through the same bucket).
