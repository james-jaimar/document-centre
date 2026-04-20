// Shared SigV4 S3 delete helper.
// The Lovable connector gateway only proxies GET (list) and HEAD requests
// for AWS S3, and only signs URLs for read/write. Deletes must go directly
// to S3 with AWS SigV4 credentials.
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

export interface S3DeleteResult {
  deleted: number;
  failed: string[];
}

function getAwsClient(): { client: AwsClient; bucket: string; region: string } {
  const accessKeyId = Deno.env.get("AWS_S3_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_S3_SECRET_ACCESS_KEY");
  const region = Deno.env.get("AWS_S3_REGION");
  const bucket = Deno.env.get("AWS_S3_BUCKET");

  if (!accessKeyId || !secretAccessKey || !region || !bucket) {
    throw new Error(
      "AWS S3 credentials missing: AWS_S3_ACCESS_KEY_ID, AWS_S3_SECRET_ACCESS_KEY, AWS_S3_REGION, AWS_S3_BUCKET required"
    );
  }

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
    service: "s3",
  });

  return { client, bucket, region };
}

function objectUrl(bucket: string, region: string, path: string): string {
  // Encode each path segment but keep slashes
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://${bucket}.s3.${region}.amazonaws.com/${encoded}`;
}

/**
 * Delete S3 objects in parallel batches using SigV4-signed DELETE requests.
 * Treats 204 (deleted) and 404 (already gone) as success.
 */
export async function deleteS3Objects(
  paths: string[],
  batchSize = 10
): Promise<S3DeleteResult> {
  if (paths.length === 0) return { deleted: 0, failed: [] };

  const { client, bucket, region } = getAwsClient();
  let deleted = 0;
  const failed: string[] = [];

  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (path) => {
        try {
          const res = await client.fetch(objectUrl(bucket, region, path), {
            method: "DELETE",
          });
          // S3 returns 204 on successful delete, 404 if already gone.
          if (res.status === 204 || res.status === 404) {
            return { ok: true, path };
          }
          const body = await res.text().catch(() => "");
          return { ok: false, path, error: `${res.status}: ${body.slice(0, 200)}` };
        } catch (e) {
          return { ok: false, path, error: (e as Error).message };
        }
      })
    );
    for (const r of results) {
      if (r.ok) deleted++;
      else failed.push(`${r.path} → ${r.error}`);
    }
  }

  return { deleted, failed };
}
