/**
 * Message attachment helpers.
 *
 * Files are uploaded straight to S3 with a pre-signed URL (via the existing
 * `s3-storage` edge function) and only their metadata is recorded in
 * `message_attachments` when the message is sent. Downloads are signed by
 * `order-engine` (action `signMessageAttachment`) so access is checked
 * against the parent order rather than trusting any signed-in user.
 */
import { supabase } from "@/integrations/supabase/client";
import { getUploadUrl, uploadToS3 } from "@/lib/s3Storage";

/** 50 MB — anything larger belongs on WeTransfer, not in chat. */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export const ALLOWED_ATTACHMENT_MIME = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
]);

export const ATTACHMENT_ACCEPT_STRING = [
  "application/pdf",
  "image/*",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".csv",
  ".txt",
].join(",");

const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png|webp|gif|heic|heif|docx?|xlsx?|pptx?|csv|txt)$/i;

export interface PendingAttachment {
  /** Local id for list keys. */
  localId: string;
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  progressLabel?: string;
  error?: string;
  filePath?: string;
}

export interface AttachmentPayload {
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
}

export interface MessageAttachmentRow {
  id: string;
  message_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageAttachment(mime?: string | null, name?: string): boolean {
  if (mime?.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name ?? "");
}

/** Returns an error message, or null when the file is acceptable. */
export function validateAttachment(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `That file is ${formatBytes(file.size)}. The chat limit is 50 MB — please send large files by WeTransfer and paste the link here.`;
  }
  const typeOk =
    (file.type && ALLOWED_ATTACHMENT_MIME.has(file.type)) || ALLOWED_EXTENSIONS.test(file.name);
  if (!typeOk) return "That file type isn't allowed here.";
  return null;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export function buildAttachmentPath(args: {
  tenantId: string;
  branchId?: string | null;
  orderId: string;
  fileName: string;
}): string {
  const branch = args.branchId || "_";
  return `tenants/${args.tenantId}/branches/${branch}/messages/${args.orderId}/${crypto.randomUUID()}_${safeName(args.fileName)}`;
}

/** Upload one file and return the metadata to attach to the message. */
export async function uploadMessageAttachment(
  file: File,
  ctx: { tenantId: string; branchId?: string | null; orderId: string },
): Promise<AttachmentPayload> {
  const objectPath = buildAttachmentPath({ ...ctx, fileName: file.name });
  await getUploadUrl(objectPath); // warm/validate signing before the PUT
  await uploadToS3(objectPath, file);
  return {
    file_name: file.name,
    file_path: objectPath,
    file_size: file.size,
    mime_type: file.type || "application/octet-stream",
  };
}

/** Ask the server for a short-lived download URL for one attachment. */
export async function getAttachmentUrl(attachmentId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("order-engine", {
    body: { action: "signMessageAttachment", attachment_id: attachmentId },
  });
  if (error) throw new Error(error.message || "Could not open this attachment");
  if (!data?.url) throw new Error(data?.error || "Could not open this attachment");
  return data.url as string;
}
