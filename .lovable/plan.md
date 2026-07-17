
## Problem

1. The activation email's PostNet logo renders far too large in Outlook/Gmail. The current inline style only sets `max-height:48px`, so wide logos stretch to their natural width.
2. Every tracked link (and the open-pixel) in outbound emails points at `https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/email-track?...`, exposing the raw Supabase project URL. It looks unprofessional and leaks infrastructure detail.

We already solved the same class of problem for logos: `/logo/<tenant>.png` is served from the tenant/app origin and the `tenant-logo` edge function streams the file. `email-image` uses the same pattern (Amplify rewrites `/email-image/*` to the function). We should mirror that for tracking.

## Plan

### 1. Serve tracking from the app/tenant origin

Change tracking URL construction so links look like:

```
https://postnetprintcentre.com/email-track?t=<token>
https://document-centre.com/email-track?t=<token>
```

Files:

- `supabase/functions/_shared/emailTracking.ts`
  - Add an optional `origin` argument (or a single `EmailTrackingContext { origin }` object) threaded through `injectTracking`, `rewriteLinksForTracking`, `appendTrackingPixel`, `buildPixelUrl`, `buildClickUrl`.
  - Build the URL as `${origin}/email-track?t=...` when provided; keep the existing `SUPABASE_URL` fallback so nothing breaks if a caller forgets to pass one.
- `supabase/functions/_shared/sendBranchActivation.ts`
  - Pass the already-resolved `appOrigin` (from `resolveAppOriginDetailed`) into `injectTracking`.
- `supabase/functions/send-branch-welcome-campaign/index.ts` and `supabase/functions/process-campaign-triggers/index.ts`
  - Resolve the tenant's app origin the same way (they already know the tenant) and pass it into `injectTracking`.

### 2. Rewrite `/email-track/*` on the tenant/app origin

The `/email-image/*` function comment documents that AWS Amplify rewrites the path to the Supabase function URL. We need the same rewrite for `/email-track`:

```
Source:      /email-track/<*>
Target:      https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/email-track/<*>
Type:        302 (Rewrite)
```

This rewrite must be added in the AWS Amplify console for:
- The Document Centre app (`document-centre.com`)
- Each tenant custom domain served through the same Amplify app (postnetprintcentre.com, etc.)

If a tenant custom domain is served by a different CDN/host, the same rewrite needs to be configured there. I will call this out in the delivery notes so you can add it once per host.

No CORS/config change to the edge function itself — it already returns image/gif and 302 redirects that work identically when reached via the rewritten path.

### 3. Shrink the logo in activation emails

In `supabase/functions/_shared/sendBranchActivation.ts` update the `logoBlock` inline style so both dimensions are constrained:

```html
<img ... style="display:block;height:auto;width:auto;max-height:44px;max-width:180px;margin-bottom:24px;border:0;outline:none;text-decoration:none;" />
```

This keeps the aspect ratio, caps the height at ~44px and the width at ~180px, which is the standard email logo footprint in Gmail/Outlook.

## Out of scope

- The `/welcome?token=...` URL itself is already on the tenant domain and stays unchanged.
- No changes to token signing, event logging, or the `email-track` function body.
- No template content edits.

## Technical notes

- Backwards compatibility: if `origin` is omitted, `emailTracking.ts` still uses `SUPABASE_URL`, so existing links in already-sent emails keep working (the function URL stays live).
- Signed tokens remain identical — only the host in the URL changes, so historical opens/clicks continue to verify.
- Amplify rewrite is a one-time infra step per domain; without it, `/email-track` would 404 on the tenant origin, so I will surface a clear pre-flight checklist in my delivery message.
