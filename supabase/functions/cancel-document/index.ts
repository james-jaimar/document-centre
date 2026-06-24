// Cancel an in-flight document upload/processing job.
//
// Used by the customer-side "Cancel" button on the upload progress modal.
// Hard-deletes the document row (per product spec — leaving a "cancelled"
// ghost row was confusing) and best-effort revokes any pending Cloud Run
// jobs attached to the backend asset so we don't burn worker time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cloudRunBase(): string | null {
  const raw = (Deno.env.get("DOCUMENT_CENTRE_API_URL") ?? "").replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname;
    if (host === "api.document-centre.com" || host.endsWith(".run.app")) return raw;
  } catch { /* ignore */ }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const documentId = String(body?.document_id ?? "").trim();
    if (!documentId) return jsonResponse({ error: "document_id required" }, 400);

    // Service-role client for full access (we authorise manually below).
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load the doc + its parent order so we can authorise.
    const { data: doc, error: docErr } = await svc
      .from("documents")
      .select("id, file_path, backend_asset_id, order_item_id")
      .eq("id", documentId)
      .maybeSingle();
    if (docErr) return jsonResponse({ error: docErr.message }, 500);
    if (!doc) return jsonResponse({ ok: true, already_deleted: true });

    const { data: oi } = await svc
      .from("order_items")
      .select("id, order_id, orders!inner(id, user_id, anonymous_session_id)")
      .eq("id", doc.order_item_id)
      .maybeSingle();
    const ownerId = (oi as any)?.orders?.user_id ?? null;
    if (ownerId && ownerId !== user.id) {
      // Allow platform admins through; everyone else is blocked.
      const { data: roles } = await svc
        .from("user_roles").select("role").eq("user_id", user.id);
      const isAdmin = (roles ?? []).some((r: any) => r.role === "platform_admin");
      if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);
    }

    // 1) Best-effort: revoke any in-flight Cloud Run jobs for this asset so
    //    we don't waste worker CPU continuing a render the user abandoned.
    const base = cloudRunBase();
    if (base && doc.backend_asset_id) {
      try {
        const upstream = await fetch(`${base}/v1/assets/${doc.backend_asset_id}/cancel-jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Ops-Actor-Id": user.id,
            "X-Ops-Actor-Email": user.email ?? "",
            "X-Ops-Actor-Role": "user",
          },
        });
        if (!upstream.ok) {
          console.warn(`[cancel-document] upstream cancel returned ${upstream.status}`);
        }
      } catch (e) {
        console.warn("[cancel-document] upstream cancel error:", (e as Error).message);
      }
    }

    // 2) Remove the source file from the user-uploads bucket. Storage
    //    failures are non-fatal — the DB delete is the source of truth.
    if (doc.file_path) {
      try {
        await svc.storage.from("document-uploads").remove([doc.file_path]);
      } catch (e) {
        console.warn("[cancel-document] storage remove failed:", (e as Error).message);
      }
    }

    // 3) Hard delete the document row. ON DELETE CASCADE / SET NULL on
    //    document_sections handles dependents.
    const { error: delErr } = await svc.from("documents").delete().eq("id", documentId);
    if (delErr) return jsonResponse({ error: delErr.message }, 500);

    return jsonResponse({ ok: true, document_id: documentId });
  } catch (e) {
    console.error("[cancel-document] error:", e);
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
