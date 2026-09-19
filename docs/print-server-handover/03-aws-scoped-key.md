# Optional: a separate AWS key locked to your folder

Recommended instead of sharing Document Centre's storage key. Create an IAM user
in AWS, attach this inline policy, and use its access key / secret in the other
app.

Replace `BUCKET` with the shared bucket name and `gasa` with your
`APP_STORAGE_PREFIX` (without the trailing slash).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListOwnPrefixOnly",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::BUCKET",
      "Condition": { "StringLike": { "s3:prefix": ["gasa/*"] } }
    },
    {
      "Sid": "ObjectsInOwnPrefix",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"],
      "Resource": "arn:aws:s3:::BUCKET/gasa/*"
    }
  ]
}
```

With this key, a bug in the other app cannot touch Document Centre's files even
if the prefix guard in `s3-storage` is bypassed. Keep both layers.

CORS on the bucket must allow the other app's origin for `GET` and `PUT`,
otherwise browser uploads fail with "failed to fetch".
