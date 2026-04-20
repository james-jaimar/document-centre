

## Bug

Customers/admins cannot delete uploaded files. Toast: *"s3-storage: Some deletes failed"*.

## Root cause

`supabase/functions/s3-storage/index.ts` handles the `delete` action by sending `DELETE https://connector-gateway.lovable.dev/aws_s3/{path}` through the Lovable connector gateway. Per the S3 connector contract, **the gateway only proxies `GET ?list-type=2` and `HEAD`**. DELETE is rejected, so every `delRes.ok` is false and the function returns 207 with "Some deletes failed".

The connector also only signs URLs for `mode=read` and `mode=write` — there is no `mode=delete`. So we cannot delete via the gateway at all.

## Fix

Sign DELETE requests directly to S3 using AWS SigV4 from the edge function, bypassing the connector for this one action.

### 1. Add AWS credentials as Supabase secrets

Required new secrets (request via the secrets flow, ask user to paste from AWS IAM):

- `AWS_S3_ACCESS_KEY_ID`
- `AWS_S3_SECRET_ACCESS_KEY`
- `AWS_S3_REGION` (e.g. `eu-west-1`)
- `AWS_S3_BUCKET` (e.g. `document-centre-uploads`)

The IAM user/role only needs `s3:DeleteObject` on `arn:aws:s3:::{bucket}/*` for these credentials.

### 2. Rewrite the `delete` branch in `s3-storage/index.ts`

Replace the gateway DELETE loop with a direct, SigV4-signed `DELETE https://{bucket}.s3.{region}.amazonaws.com/{key}` request per object. Use the `aws4fetch` library (`https://esm.sh/aws4fetch@1.0.20`) which is the standard lightweight SigV4 client for Deno:

```ts
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const aws = new AwsClient({
  accessKeyId: Deno.env.get("AWS_S3_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("AWS_S3_SECRET_ACCESS_KEY")!,
  region: Deno.env.get("AWS_S3_REGION")!,
  service: "s3",
});

const bucket = Deno.env.get("AWS_S3_BUCKET")!;
const region = Deno.env.get("AWS_S3_REGION")!;

// For each path:
const url = `https://${bucket}.s3.${region}.amazonaws.com/${encodeURI(path)}`;
const res = await aws.fetch(url, { method: "DELETE" });
// 204 = deleted, 404 = already gone (treat as success)
```

Run deletes in parallel batches of 10 with `Promise.all` for speed, collect failures with status code + body text for diagnostics, and only return 207 if at least one truly failed (still treat 404 as success).

### 3. Verify other actions still use the connector

`sign-upload` and `sign-download` continue to go through the gateway (`/api/v1/sign_storage_url`) — no changes. Only `delete` switches to direct AWS.

### 4. Same fix for `cleanup-stale-drafts`

`supabase/functions/cleanup-stale-drafts/index.ts` has the identical broken pattern (`DELETE ${GATEWAY_URL}/aws_s3/${path}`). Refactor its `deleteS3Objects` helper to use the same `aws4fetch` SigV4 client. Easiest: extract a shared helper into `supabase/functions/_shared/s3Delete.ts` and import from both functions.

## Files to change

- `supabase/functions/_shared/s3Delete.ts` — new shared SigV4 delete helper.
- `supabase/functions/s3-storage/index.ts` — replace `delete` action body with the helper; parallelize.
- `supabase/functions/cleanup-stale-drafts/index.ts` — replace `deleteS3Objects` with the helper.
- New Supabase secrets: `AWS_S3_ACCESS_KEY_ID`, `AWS_S3_SECRET_ACCESS_KEY`, `AWS_S3_REGION`, `AWS_S3_BUCKET`.

## Verification

1. Customer opens a draft order → clicks trash on a file → toast "File deleted", file disappears from the list.
2. Confirm in AWS S3 console that the object is gone.
3. Delete a whole draft order with multiple files → all files removed, no error toast.
4. Manually invoke `cleanup-stale-drafts` → DB rows removed AND storage objects removed (check S3 console / log line `S3 deleted: N, failed: 0`).
5. Edge function logs show `204` (or `404`) responses, no `405`/`403`.

## Why not use the connector

The Lovable S3 connector intentionally restricts the gateway to read-only proxy + signed read/write URLs. There is no signed-delete mode and no DELETE proxy. Using the AWS keys directly for DELETE is the documented escape hatch and is scoped narrowly (single permission, single bucket).

## What you'll need to do

When I switch to default mode I'll request the four AWS secrets. You'll need:

1. An AWS IAM user with policy:
   ```json
   { "Version":"2012-10-17","Statement":[{
     "Effect":"Allow","Action":"s3:DeleteObject","Resource":"arn:aws:s3:::YOUR-BUCKET/*"
   }]}
   ```
2. Its access key ID + secret access key.
3. The bucket name and region you're already using with the connector.

