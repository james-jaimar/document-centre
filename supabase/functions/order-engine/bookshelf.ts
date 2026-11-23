import { assertBookshelfActor, assertBookshelfPdf, assertBookshelfQuantity, copyBookshelfSnapshot } from "./bookshelf-rules.ts";
import { deleteS3Objects } from "../_shared/s3Delete.ts";

export async function bookshelfOperation(admin: any, actor: { id: string; is_anonymous?: boolean }, authHeader: string, payload: any) {
  const tenantId = payload.tenant_id;
  if (typeof tenantId !== "string") throw new Error("Missing tenant");
  const [{ data: enabled, error: settingError }, { data: membership, error: membershipError }] = await Promise.all([
    admin.rpc("bookshelf_enabled", { p_tenant_id: tenantId }),
    admin.from("tenant_memberships").select("id").eq("tenant_id", tenantId).eq("profile_id", actor.id).eq("is_active", true).limit(1),
  ]);
  if (settingError || membershipError) throw new Error("Could not check bookshelf access");
  assertBookshelfActor(actor, enabled, !!membership?.length);
  const mode = payload.operation;
  if (!["create", "revise", "restore", "rename", "archive", "reorder"].includes(mode)) throw new Error("Unknown bookshelf operation");
  if (mode === "reorder") {
    // Shelf position is presentation-only: stored beside the frozen spec, never touches pricing.
    const ids = payload.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((v: unknown) => typeof v === "string")) throw new Error("Invalid shelf order");
    const { data: rows, error } = await admin.from("bookshelf_items").select("id,snapshot").in("id", ids).eq("profile_id", actor.id).eq("tenant_id", tenantId).is("archived_at", null);
    if (error || !rows || rows.length !== new Set(ids).size) throw new Error("Bookshelf product not found");
    const byId = new Map(rows.map((r: any) => [r.id, r]));
    for (const [index, rowId] of ids.entries()) {
      const row: any = byId.get(rowId);
      if (row.snapshot?.shelf_position === index) continue;
      const { error: updateError } = await admin.from("bookshelf_items").update({ snapshot: { ...row.snapshot, shelf_position: index } }).eq("id", rowId).eq("profile_id", actor.id).eq("tenant_id", tenantId);
      if (updateError) throw new Error("Could not save shelf order");
    }
    return { ok: true };
  }
  let shelf: any;
  if (mode !== "create") {
    const { data, error } = await admin.from("bookshelf_items").select("*").eq("id", payload.id).eq("profile_id", actor.id).eq("tenant_id", tenantId).is("archived_at", null).single();
    if (error || !data) throw new Error("Bookshelf product not found");
    shelf = data;
  }
  const id = shelf?.id ?? crypto.randomUUID();
  const data: any = { name: payload.name, sku: payload.sku ?? "", expected_revision: shelf?.revision };
  let snapshot: any;
  let prefix = "";
  if (mode === "create" || mode === "revise") {
    const { data: item, error } = await admin.from("order_items").select("*").eq("id", payload.order_item_id).single();
    if (error || !item) throw new Error("Source product not found");
    const { data: order } = await admin.from("orders").select("*").eq("id", item.order_id).eq("user_id", actor.id).eq("tenant_id", tenantId).single();
    if (!order?.app_id) throw new Error("Source product not found in this tenant");
    if (mode === "revise" && (order.order_status !== "draft" || order.metadata?.bookshelf_item_id !== id || order.metadata?.bookshelf_revision !== shelf.revision)) {
      throw new Error("This product changed. Open a fresh copy from your bookshelf.");
    }
    const [docs, sections, family] = await Promise.all([
      admin.from("documents").select("*").eq("order_item_id", item.id).order("sort_order"),
      admin.from("document_sections").select("*").eq("order_item_id", item.id).order("sort_order"),
      admin.from("product_families").select("name,is_active").eq("id", item.product_family_id).single(),
    ]);
    if (docs.error || sections.error || family.error || !family.data?.is_active) throw new Error("Could not load this product's PDF configuration");
    snapshot = { product_family_id: item.product_family_id, product_name: family.data.name, spec: item.spec, documents: docs.data, sections: sections.data };
    if (shelf?.snapshot?.shelf_category) snapshot.shelf_category = shelf.snapshot.shelf_category;
    if (typeof shelf?.snapshot?.shelf_position === "number") snapshot.shelf_position = shelf.snapshot.shelf_position;
    assertBookshelfPdf(snapshot);
    data.source_item_id = item.id;
    prefix = `tenants/${tenantId}/bookshelf/${id}/${crypto.randomUUID()}`;
  } else if (mode === "restore") {
    assertBookshelfQuantity(payload.quantity);
    snapshot = shelf.snapshot;
    assertBookshelfPdf(snapshot);
    const { data: family } = await admin.from("product_families").select("is_active").eq("id", snapshot.product_family_id).single();
    if (!family?.is_active) throw new Error("This product is no longer available. Contact the store.");
    data.quantity = payload.quantity;
    data.order_id = crypto.randomUUID();
    data.item_id = crypto.randomUUID();
    prefix = `order-items/${data.item_id}`;
  }
  const copiedPaths: string[] = [];
  try {
    if (snapshot) {
      data.snapshot = await copyBookshelfSnapshot(snapshot, prefix, async (from, to) => {
        // Track attempted destinations too: storage can time out after a successful write.
        copiedPaths.push(to);
        const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/s3-storage`, {
          method: "POST", headers: { Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "copy", source_path: from, dest_path: to }),
        });
        const result = await response.json();
        if (!response.ok || result.error || !result.success) throw new Error(result.error || "Could not safely copy the PDF");
      });
    }
    const { data: result, error } = await admin.rpc("commit_bookshelf_operation", {
      p_actor: actor.id, p_tenant: tenantId, p_action: mode, p_id: id, p_data: data,
    });
    if (error) throw new Error(error.message);
    if (["create", "revise", "rename"].includes(mode) && typeof payload.category === "string") {
      const category = payload.category.trim().slice(0, 80);
      if (category) {
        // Shelf label is presentation-only: it sits beside the frozen spec and never touches pricing.
        const { data: row } = await admin.from("bookshelf_items").select("snapshot").eq("id", id).eq("tenant_id", tenantId).eq("profile_id", actor.id).single();
        if (row?.snapshot) await admin.from("bookshelf_items").update({ snapshot: { ...row.snapshot, shelf_category: category } }).eq("id", id);
      }
    }
    return result;
  } catch (error) {
    if (copiedPaths.length) {
      try { await deleteS3Objects(copiedPaths); } catch { console.error("Bookshelf failed-copy cleanup could not finish"); }
    }
    throw error;
  }
}