/**
 * Client-side helpers for S3 storage operations via the s3-storage edge function.
 */
import { supabase } from "@/integrations/supabase/client";

async function callS3Function(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("s3-storage", {
    body,
  });
  if (error) throw new Error(`s3-storage call failed: ${error.message}`);
  if (data?.error) throw new Error(`s3-storage: ${data.error}`);
  return data;
}

/**
 * Get a presigned PUT URL for uploading a file to S3.
 */
export async function getUploadUrl(objectPath: string): Promise<{ url: string; method: string }> {
  const data = await callS3Function({
    action: "sign-upload",
    object_path: objectPath,
  });
  return { url: data.url, method: data.method };
}

/**
 * Upload a file to S3 using a presigned URL.
 */
export async function uploadToS3(objectPath: string, file: File | Blob): Promise<void> {
  const { url } = await getUploadUrl(objectPath);
  const res = await fetch(url, {
    method: "PUT",
    body: file,
  });
  if (!res.ok) {
    throw new Error(`S3 upload failed [${res.status}]: ${await res.text()}`);
  }
}

/**
 * Get presigned download URLs for multiple S3 object paths.
 * Returns a map of objectPath → signedUrl.
 */
export async function getDownloadUrls(objectPaths: string[]): Promise<Record<string, string>> {
  if (objectPaths.length === 0) return {};
  const data = await callS3Function({
    action: "sign-download",
    object_paths: objectPaths,
  });
  return data.signed_urls ?? {};
}

/**
 * Delete one or more S3 objects.
 */
export async function deleteFromS3(objectPaths: string[]): Promise<void> {
  if (objectPaths.length === 0) return;
  await callS3Function({
    action: "delete",
    object_paths: objectPaths,
  });
}

/**
 * Physically copy an S3 object to a new key (server-side CopyObject).
 * Returns the new object path.
 */
export async function copyS3Object(sourcePath: string, destPath: string): Promise<string> {
  await callS3Function({
    action: "copy",
    source_path: sourcePath,
    dest_path: destPath,
  });
  return destPath;
}
