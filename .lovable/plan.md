## Problem

The marketing email references the hero at:

```
https://<tenant-origin>/__l5e/assets-v1/<id>/marketing-hero.jpg
```

`/__l5e/*` is Lovable's preview/dev CDN path. It is **not** served by your Amplify production deployment (document-centre.com) and definitely not by tenant custom domains (postnetprintcentre.com). Amplify's catch-all rewrite turns it into `index.html`, so email clients get HTML where they expect a JPEG → broken image icon.

The inline images uploaded through the editor already use `/email-image/<path>`, which is the correct, proxy-backed pattern.

## Fix

1. Upload `marketing-hero.jpg` once into the existing private `email-assets` Supabase Storage bucket at a stable key, e.g. `marketing/marketing-hero.jpg`.
2. Update `supabase/functions/send-branch-marketing-campaign/index.ts`:
   - Replace `MARKETING_HERO_PATH = "/__l5e/assets-v1/.../marketing-hero.jpg"` with `MARKETING_HERO_PATH = "/email-image/marketing/marketing-hero.jpg"`.
   - Leave the rest of the branded-shell wiring as-is (image is still rendered from the tenant origin via the existing rewrite).
3. No Amplify config change needed — your existing `/email-image/<*>` rewrite already proxies to the `email-image` edge function, which streams from the `email-assets` bucket.

## Action on your side (one-time, infra)

For any **tenant custom domain** (e.g. `postnetprintcentre.com`) that is served by a separate Amplify app/branch, you must add the **same two rewrites** that document-centre.com has:

```
/logo/<*>         → https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/tenant-logo/<*>     (200)
/email-image/<*>  → https://lcvdhtaqoumyokjqaqfw.supabase.co/functions/v1/email-image/<*>     (200)
```

Without these, inline editor images on tenant-custom-domain emails will also break exactly the same way the hero does today.

## Verification

After the deploy:
- Open the marketing template, send a test to yourself.
- `curl -I https://document-centre.com/email-image/marketing/marketing-hero.jpg` should return `200` with `Content-Type: image/jpeg` (not `text/html`).
- The hero should render inline in Outlook/Gmail.
