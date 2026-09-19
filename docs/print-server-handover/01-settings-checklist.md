# Settings checklist

Add these in the other app's backend secrets. Values are **not** written in this
pack — copy them from Document Centre's secret store (Project Settings →
Secrets), where each is saved under the same name.

| Name | What it is | Value source |
|---|---|---|
| `DOCUMENT_CENTRE_API_URL` | Print server base address | Document Centre secret of the same name (`https://api.document-centre.com`) |
| `OPS_APP_ID` | Short slug identifying the calling app, e.g. `gasa` | You choose it; keep it stable |
| `APP_STORAGE_PREFIX` | Top-level folder in the shared bucket, e.g. `gasa/` | You choose it; must end with `/` |
| `AWS_S3_BUCKET` | Shared Cape Town bucket name | Document Centre secret of the same name |
| `AWS_S3_REGION` | `af-south-1` | Document Centre secret of the same name |
| `AWS_S3_ACCESS_KEY_ID` | Storage access key | Document Centre secret, or a new scoped key (see `03-aws-scoped-key.md`) |
| `AWS_S3_SECRET_ACCESS_KEY` | Storage secret key | as above |
| `LOVABLE_API_KEY` | Present automatically once Cloud is enabled | auto |
| `AWS_S3_API_KEY` | Created automatically when you connect AWS S3 in the other workspace | auto, via Connectors |

## Two ways to reach storage

**A. Lovable AWS S3 connector (recommended).** In the other app's workspace,
connect AWS S3 with the access key / secret above, bucket `AWS_S3_BUCKET`,
region `af-south-1`, and enable write. This populates `AWS_S3_API_KEY`, and the
`s3-storage` function works as shipped (signed upload/download through the
gateway).

**B. Direct AWS credentials.** If you skip the connector, the signing calls in
`s3-storage` must be replaced with direct SigV4 presigning using
`AWS_S3_ACCESS_KEY_ID` / `AWS_S3_SECRET_ACCESS_KEY`. `_shared/s3Delete.ts`
already shows that pattern — deletes always go direct because the gateway does
not proxy DELETE.

## Verification

1. `curl -fsS https://api.document-centre.com/health` returns OK.
2. Call `s3-storage` with `{ "action": "sign-upload", "object_path": "<prefix>test.pdf" }`
   while signed in — a URL comes back.
3. Repeat with a path **outside** your prefix — it must return 403.
4. Run one `inspect` job (see `02-how-to-call.md`) and confirm it completes.
5. Ask the Document Centre platform Jobs screen to filter by your `OPS_APP_ID` —
   your job appears there.
