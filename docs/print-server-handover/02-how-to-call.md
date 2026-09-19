# How to call the print server

All calls go through your own `pdf-api` edge function. The browser calls
`supabase.functions.invoke("pdf-api", { body: { path, method, ...payload } })`.
The function checks the login, whitelists the path, and forwards to the print
server with your app tag attached.

Allowed path prefixes: `v1/assets`, `v1/jobs`, `v1/operations`, `health`.
(`v1/ops` — platform ops/metrics — is deliberately not exposed to other apps.)

## The standard flow

### 1. Upload the original file to storage

```ts
const { data } = await supabase.functions.invoke("s3-storage", {
  body: { action: "sign-upload", object_path: `${prefix}originals/${id}.pdf` },
});
await fetch(data.url, { method: "PUT", body: file });
```

`prefix` is your `APP_STORAGE_PREFIX`; the function rejects anything else.

### 2. Register it as an asset

```ts
const asset = await invokePdf({
  path: "v1/assets",
  method: "POST",
  source_storage_path: `${prefix}originals/${id}.pdf`,
  media_type: "application/pdf",
  filename: file.name,
});
// → { id: "<asset_id>", ... }
```

### 3. Inspect it (page count, trim size, boxes)

```ts
const job = await invokePdf({ path: `v1/assets/${asset.id}/inspect`, method: "POST" });
```

### 4. Run an operation

Each returns `{ job_id }`:

| Path | Does |
|---|---|
| `v1/operations/convert-office` | Word / PowerPoint / OpenDocument → PDF |
| `v1/operations/crop-rasterize` | Flatten to the trim/crop box |
| `v1/operations/generate-previews` | JPEG page previews (150 DPI default) |
| `v1/operations/cmyk` | Convert to press CMYK with the shipped ICC profiles |
| `v1/operations/grayscale`, `rotate`, `resize`, `nup`, `merge`, `booklet`, `impose-sheet` | as named |

Bodies are documented live at `https://api.document-centre.com/openapi.json`.

### 5. Poll the job

```ts
const state = await invokePdf({ path: `v1/jobs/${job_id}`, method: "GET" });
// status: queued | running | completed | failed, plus `error` when failed
```

Poll every 1–2 s with a cap; surface `error` verbatim to your logs and a plain
message to the user.

### 6. Fetch the output

```ts
const files = await invokePdf({ path: `v1/assets/${asset.id}/files`, method: "GET" });
// each derived file has kind + storage_path
const { data } = await supabase.functions.invoke("s3-storage", {
  body: { action: "sign-download", object_paths: [files[0].storage_path] },
});
```

## Helper

```ts
async function invokePdf(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("pdf-api", { body });
  if (error) throw new Error(await (error as any).context?.text?.() ?? error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}
```

## Things that bite

- Jobs are asynchronous. Nothing is ready when the call returns.
- Large files: use the signed URL directly from the browser; never stream bytes
  through an edge function.
- The print server keeps its own asset and job records. Store the `asset_id`
  against your own order/product row — that is the join key.
- Transient 502/503 from the edge runtime is normal under load; retry with
  backoff (the shipped functions already do this for storage).
