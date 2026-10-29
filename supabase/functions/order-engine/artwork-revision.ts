import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { canReviseArtwork, replaceArtworkPath } from "./artwork-revision-rules.ts";

function pathRecords(value: any, result: any[] = []): any[] {
  if (!value || typeof value !== "object") return result;
  if (value.storage_path || value.file_path) result.push(value);
  Object.values(value).forEach(v => pathRecords(v, result));
  return result;
}

export async function artworkRevision(admin: any, userId: string, authHeader: string, payload: any, phase: "prepare" | "apply", staffGuard: any) {
  const fail = (message: string) => { throw new Error(message); };
  const { data: job } = await admin.from("order_jobs").select("*").eq("id", payload.job_id).single();
  if (!job) return fail("Job not found");
  const { data: order } = await admin.from("orders").select("*").eq("id", job.order_id).single();
  if (!order) return fail("Order not found");
  const denied = await staffGuard(admin, userId, order);
  const staff = !denied;
  if (!staff && order.user_id !== userId && order.ordered_by_profile_id !== userId) return fail("Not authorised for this order");
  if (!canReviseArtwork(order, job, staff)) return fail("Artwork updates are closed after production starts");
  const cfg = job.configuration || {};
  if (cfg.canvas_prints || cfg.photo_prints || cfg.raw_spec?.canvas_prints || cfg.raw_spec?.photo_prints) {
    return fail("Photo and canvas changes require a new crop/layout review. Please contact the branch.");
  }
  const storage = async (body: any) => {
    const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/s3-storage`, {
      method: "POST", headers: { Authorization: authHeader, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || data.error) return fail(data.error || "Could not access artwork storage");
    return data;
  };
  if (phase === "prepare") {
    const { replaces_path, file_name, file_size_bytes, mime_type, reason } = payload;
    if (typeof replaces_path !== "string" || !pathRecords(cfg).some(r => (r.storage_path || r.file_path) === replaces_path)) return fail("Choose an existing artwork file");
    if (typeof file_name !== "string" || !/\.(pdf|png|jpe?g)$/i.test(file_name) || file_name.length > 200) return fail("Use a PDF, JPG or PNG artwork file");
    if (!["application/pdf", "image/png", "image/jpeg"].includes(mime_type)) return fail("Invalid artwork format");
    if (!Number.isInteger(file_size_bytes) || file_size_bytes <= 0 || file_size_bytes > 200 * 1024 * 1024) return fail("Artwork must be no larger than 200 MB");
    if (staff && (typeof reason !== "string" || !reason.trim())) return fail("Please give a reason for replacing the artwork");
    if (!cfg.templated_artwork && mime_type !== "application/pdf") return fail("Supply a PDF for this document job");
    const original = pathRecords(cfg).find(r => (r.storage_path || r.file_path) === replaces_path);
    const id = crypto.randomUUID();
    const path = `tenants/${order.tenant_id}/orders/${order.id}/artwork-revisions/${id}/${file_name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await admin.from("order_documents").insert({ id, app_id: order.app_id, tenant_id: order.tenant_id, branch_id: order.branch_id,
      order_id: order.id, job_id: job.id, document_type: "artwork_revision", file_name, file_size_bytes, mime_type,
      storage_bucket: "s3", storage_path: path, created_by: userId, is_customer_visible: false,
      metadata: { state: "uploading", replaces_path, original_name: original?.file_name, reason: String(reason || "").slice(0, 1000) },
    });
    if (error) return fail(error.message);
    const signed = await storage({ action: "sign-upload", object_path: path });
    return { revision_id: id, upload_url: signed.url };
  }
  const { data: revision } = await admin.from("order_documents").select("*").eq("id", payload.revision_id).eq("job_id", job.id).eq("created_by", userId).single();
  if (!revision || revision.metadata?.state !== "uploading") return fail("Invalid or already applied revision");
  const oldPath = revision.metadata.replaces_path;
  if (!pathRecords(cfg).some(r => (r.storage_path || r.file_path) === oldPath)) return fail("Original artwork changed; reload the order");
  const signed = await storage({ action: "sign-download", object_paths: [revision.storage_path] });
  const url = signed.signed_urls?.[revision.storage_path];
  if (!url) return fail("Uploaded artwork not available");
  const response = await fetch(url);
  if (!response.ok) return fail("Upload did not complete; try again");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== revision.file_size_bytes || bytes.length > 200 * 1024 * 1024) return fail("Uploaded file size does not match");
  if (revision.mime_type === "application/pdf") {
    const pdf = await PDFDocument.load(bytes);
    if (!pdf.getPageCount()) return fail("The PDF has no pages");
    const original = pathRecords(cfg).find(r => (r.storage_path || r.file_path) === oldPath);
    if (!cfg.templated_artwork && original?.page_count && pdf.getPageCount() !== original.page_count) return fail("Replacement PDF must keep the original page count; contact the branch for specification changes");
    if (!cfg.templated_artwork && original?.page_width_mm && original?.page_height_mm) {
      const box = pdf.getPage(0).getTrimBox();
      const width = box.width * 25.4 / 72, height = box.height * 25.4 / 72;
      if (Math.abs(width - original.page_width_mm) > 2 || Math.abs(height - original.page_height_mm) > 2) return fail("Replacement PDF must keep the original page dimensions; contact the branch for specification changes");
    }
  } else if (revision.mime_type === "image/png") {
    if (bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return fail("Invalid PNG artwork");
  } else if (bytes[0] !== 255 || bytes[1] !== 216) return fail("Invalid JPG artwork");
  const configuration = replaceArtworkPath(cfg, oldPath, revision);
  delete configuration.preview;
  configuration.artwork_revision = { id: revision.id, file_name: revision.file_name, updated_at: new Date().toISOString(), review_required: true };
  const { data, error } = await admin.rpc("apply_order_artwork_revision", { p_document_id: revision.id, p_actor: userId,
    p_expected_configuration: cfg, p_configuration: configuration });
  if (error) return fail(error.message);
  return data;
}