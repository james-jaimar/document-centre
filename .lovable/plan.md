# Clean up console errors

Three independent issues showed up in the console. Two are quick code fixes; one needs an AWS console action you'll have to do (not something I can do from Lovable).

## 1. `tenant=…/orderId` causing 400s on `tenants` and `orders`

**Root cause.** `src/pages/platform/PlatformDemoActivity.tsx:142` builds the link as:

```ts
`${buildAdminPath("/admin/orders", demoTenant.id)}/${o.id}`
```

`buildAdminPath` already returns `/admin/orders?tenant=<tenantId>`, so the `/${o.id}` gets appended **after the query string**, producing URLs like `/admin/orders?tenant=<tenantId>/<orderId>`. React Router then reads the `tenant` param as `<tenantId>/<orderId>`, which is what gets sent to PostgREST → 400 on both `tenants` and `orders`.

**Fix.** Compose the path first, then call `buildAdminPath`:

```ts
buildAdminPath(`/admin/orders/${o.id}`, demoTenant.id)
```

## 2. Missing `autocomplete` on password inputs

Affected files:
- `src/pages/Auth.tsx` (sign-in / sign-up password field)
- `src/pages/ResetPassword.tsx` (two password fields)

Add `autoComplete` props:
- Sign-in: `autoComplete="current-password"`
- Sign-up + reset (new + confirm): `autoComplete="new-password"`
- Any email field nearby gets `autoComplete="email"` for consistency.

Silences the DOM warning and improves password-manager UX.

## 3. S3 CORS blocking image previews on `document-centre.com`

The `[photo-prints-admin-gallery] crop render skipped` errors and the `net::ERR_FAILED` lines on `s3.af-south-1.amazonaws.com/jaimar-dev-…` are all CORS rejections. The signed URLs themselves are valid — `<img>` tags load them fine — but the canvas-based crop renderer fetches them with `crossOrigin="anonymous"`, which requires the bucket to return `Access-Control-Allow-Origin`.

**This is a bucket-level config you have to apply in AWS — I can't change it from here.** In the S3 console for `jaimar-dev-600743178200-af-south-1-an` → Permissions → CORS, set:

```json
[
  {
    "AllowedOrigins": [
      "https://document-centre.com",
      "https://www.document-centre.com",
      "https://document-centre.jaimar.dev",
      "https://document-centre.lovable.app",
      "https://*.lovable.app",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Once that's in, the crop previews on the admin order detail page will render instead of falling back to the plain signed `<img>`.

## Scope

Code changes are limited to:
- `src/pages/platform/PlatformDemoActivity.tsx` (1 line)
- `src/pages/Auth.tsx` (autocomplete attrs)
- `src/pages/ResetPassword.tsx` (autocomplete attrs)

No backend, RLS, or storage migration needed.
