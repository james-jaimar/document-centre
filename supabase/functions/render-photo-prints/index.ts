// Server-side photo prints render orchestrator.
// Mirrors usePhotoRenderQueue but runs in the background so the customer
// never sees a "preparing your prints" modal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Photo print sizes (must mirror src/lib/photoPrints/sizes.ts) ────────
const PHOTO_SIZES: Record<string, { width_mm: number; height_mm: number }> = {
  "4x6": { width_mm: 102, height_mm: 152 },
  "5x7": { width_mm: 127, height_mm: 178 },
  "6x8": { width_mm: 152, height_mm: 203 },
  "8x10": { width_mm: 203, height_mm: 254 },
  "8x12": { width_mm: 203, height_mm: 305 },
  "a4": { width_mm: 210, height_mm: 297 },
  "a3": { width_mm: 297, height_mm: 420 },
  "square-4": { width_mm: 102, height_mm: 102 },
  "square-5": { width_mm: 127, height_mm: 127 },
  "square-8": { width_mm: 203, height_mm: 203 },
};

const BORDER_OPTIONS: Record<string, number> = {
  none: 0,
  "thin-white": 3,
  "white-3mm": 3,
  "white-5mm": 5,
};

function getSize(slug: string) {
  return PHOTO_SIZES[slug] ?? PHOTO_SIZES["4x6"];
}

function getBorderMm(slug: string) {
  return BORDER_OPTIONS[slug] ?? 0;
}

// ── Document Centre helpers ─────────────────────────────────────────────
// We route all Document Centre calls through the existing `pdf-api` edge
// function (same path the browser uses) so the user's JWT authenticates the
// upstream request. This avoids drift from the browser hook behaviour.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PDF_API_URL = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/pdf-api`;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function makeDcRequest(authHeader: string) {
  return async function dcRequest<T = any>(
    path: string,
    method: "GET" | "POST" = "POST",
    body?: Record<string, unknown>,
  ): Promise<T> {
    const payload: Record<string, unknown> = { path, method, ...(body ?? {}) };
    const res = await fetch(PDF_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(`[render-photo-prints] dc ${method} ${path} -> ${res.status}`);
    if (!res.ok) {
      throw new Error(
        `Document Centre ${method} ${path} failed ${res.status}: ${text.slice(0, 300)}`,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Document Centre ${method} ${path} returned non-JSON: ${text.slice(0, 200)}`);
    }
  };
}

type DcRequest = ReturnType<typeof makeDcRequest>;

async function pollJob(dcRequest: DcRequest, jobId: string, intervalMs = 2500, maxAttempts = 240): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const job = await dcRequest<any>(`v1/jobs/${jobId}`, "GET");
    if (["completed", "failed", "cancelled"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Job ${jobId} timed out`);
}

// ── Main render ─────────────────────────────────────────────────────────
async function renderForOrderItem(supabase: any, dcRequest: DcRequest, orderItemId: string) {
  console.log(`[render-photo-prints] start order_item=${orderItemId}`);

  const { data: item, error: itemErr } = await supabase
    .from("order_items")
    .select("id, spec, order_id")
    .eq("id", orderItemId)
    .single();
  if (itemErr || !item) throw new Error(`order_item not found: ${itemErr?.message}`);

  const pp = (item.spec as any)?.photo_prints;
  const photos: any[] = Array.isArray(pp?.photos) ? pp.photos : [];
  if (!photos.length) throw new Error("no photos to render");

  const borderMm = getBorderMm(pp?.border_slug ?? "none");

  const pagesToMerge: string[] = [];
  const perPhoto: Array<{ entryId: string; assetId: string | null; error?: string }> = [];

  for (const photo of photos) {
    try {
      const { asset_id } = await dcRequest<{ asset_id: string }>(
        "v1/assets",
        "POST",
        {
          original_filename: photo.file_name,
          media_type: photo.mime_type || "image/jpeg",
          source_storage_path: photo.original_storage_path,
          auto_queue: false,
        },
      );

      const cap = photo.croppedAreaPixels;
      if (cap && cap.width > 0 && cap.height > 0) {
        const { job_id } = await dcRequest<{ job_id: string }>(
          "v1/operations/crop-rasterize",
          "POST",
          {
            asset_id,
            box: [cap.x, cap.y, cap.x + cap.width, cap.y + cap.height],
            dpi: 300,
          },
        );
        await pollJob(dcRequest, job_id);
      }

      const size = getSize(photo.print_size_slug);

      if (borderMm > 0) {
        const innerW = Math.max(1, size.width_mm - borderMm * 2);
        const innerH = Math.max(1, size.height_mm - borderMm * 2);
        const { job_id: innerJob } = await dcRequest<{ job_id: string }>(
          "v1/operations/resize",
          "POST",
          { asset_id, width_mm: innerW, height_mm: innerH, fit_mode: "fit" },
        );
        await pollJob(dcRequest, innerJob);
        const { job_id: outerJob } = await dcRequest<{ job_id: string }>(
          "v1/operations/resize",
          "POST",
          { asset_id, width_mm: size.width_mm, height_mm: size.height_mm, fit_mode: "fit" },
        );
        await pollJob(dcRequest, outerJob);
      } else {
        const { job_id } = await dcRequest<{ job_id: string }>(
          "v1/operations/resize",
          "POST",
          {
            asset_id,
            width_mm: size.width_mm,
            height_mm: size.height_mm,
            fit_mode: photo.fit_mode === "fit" ? "fit" : "fill",
          },
        );
        await pollJob(dcRequest, job_id);
      }

      const qty = Math.max(1, Math.floor(photo.quantity || 1));
      for (let i = 0; i < qty; i++) pagesToMerge.push(asset_id);
      perPhoto.push({ entryId: photo.id, assetId: asset_id });
    } catch (err: any) {
      const msg = err?.message ?? "render failed";
      console.error(`[render-photo-prints] photo failed name=${photo.file_name}: ${msg}`);
      perPhoto.push({ entryId: photo.id, assetId: null, error: msg });
    }
  }

  if (pagesToMerge.length === 0) {
    throw new Error(
      `nothing to merge — first error: ${perPhoto.find((p) => p.error)?.error ?? "unknown"}`,
    );
  }

  const filename = `photo-prints-${orderItemId}.pdf`;
  const { job_id: mergeJobId } = await dcRequest<{ job_id: string }>(
    "v1/operations/merge",
    "POST",
    { asset_ids: pagesToMerge, output_filename: filename },
  );
  const mergeJob = await pollJob(dcRequest, mergeJobId);

  let mergedAssetId: string | null =
    mergeJob.result?.asset_id || mergeJob.result?.merged_asset_id || null;
  let mergedStoragePath: string | null = null;

  if (mergedAssetId) {
    const derived = await dcRequest<any[]>(
      `v1/assets/${mergedAssetId}/derived-files`,
      "GET",
    );
    const mergedFile =
      derived.find((d) => d.kind === "merged") ||
      derived.find((d) => d.media_type === "application/pdf") ||
      derived[0];
    mergedStoragePath = mergedFile?.storage_path ?? null;
  } else {
    const derived = await dcRequest<any[]>(
      `v1/assets/${pagesToMerge[0]}/derived-files`,
      "GET",
    );
    const mergedFile = derived.find((d) => d.kind === "merged");
    if (mergedFile) {
      mergedAssetId = mergedFile.asset_id;
      mergedStoragePath = mergedFile.storage_path;
    }
  }

  let mergedDocumentId: string | null = null;
  if (mergedStoragePath) {
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        order_item_id: orderItemId,
        file_name: filename,
        file_path: mergedStoragePath,
        mime_type: "application/pdf",
        page_count: pagesToMerge.length,
        document_status: "ready",
        backend_asset_id: mergedAssetId,
        preflight_data: {
          kind: "photo_prints_merged",
          page_count: pagesToMerge.length,
        },
      })
      .select("id")
      .single();
    if (docErr) {
      console.warn(`[render-photo-prints] documents insert failed`, docErr);
    } else {
      mergedDocumentId = doc.id;
    }
  }

  // Patch the spec back so the admin gallery picks up the merged PDF.
  const updatedPhotos = photos.map((p) => {
    const r = perPhoto.find((x) => x.entryId === p.id);
    return r?.assetId ? { ...p, render_asset_id: r.assetId } : p;
  });

  const newSpec = {
    ...(item.spec as any),
    photo_prints: {
      ...(item.spec as any).photo_prints,
      photos: updatedPhotos,
      merged_asset_id: mergedAssetId,
      merged_storage_path: mergedStoragePath,
      merged_document_id: mergedDocumentId,
      render_completed_at: new Date().toISOString(),
      render_failed_at: null,
      render_error: null,
    },
  };

  await supabase.from("order_items").update({ spec: newSpec }).eq("id", orderItemId);

  console.log(`[render-photo-prints] done order_item=${orderItemId} merged=${mergedStoragePath}`);
  return { mergedAssetId, mergedStoragePath, mergedDocumentId, perPhoto };
}

async function persistFailure(supabase: any, orderItemId: string, err: any) {
  try {
    const { data: item } = await supabase
      .from("order_items")
      .select("spec")
      .eq("id", orderItemId)
      .single();
    if (!item) return;
    const spec = (item.spec as any) ?? {};
    const pp = spec.photo_prints ?? {};
    const newSpec = {
      ...spec,
      photo_prints: {
        ...pp,
        render_failed_at: new Date().toISOString(),
        render_error: String(err?.message ?? err ?? "render failed").slice(0, 500),
        render_attempts: (Number(pp.render_attempts) || 0) + 1,
      },
    };
    await supabase.from("order_items").update({ spec: newSpec }).eq("id", orderItemId);
  } catch (e) {
    console.error("[render-photo-prints] persistFailure failed", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const dcRequest = makeDcRequest(authHeader);

    const body = await req.json().catch(() => ({}));
    const orderItemId = body?.order_item_id;
    if (!orderItemId || typeof orderItemId !== "string") {
      return new Response(JSON.stringify({ error: "order_item_id required" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const url = new URL(req.url);
    const isAsync = url.searchParams.get("async") === "1" || body?.async === true;

    if (isAsync) {
      // Fire-and-forget: customer is already on the cart page.
      // @ts-ignore EdgeRuntime is provided in Supabase Edge runtime
      EdgeRuntime.waitUntil(
        renderForOrderItem(supabase, orderItemId).catch((err) =>
          console.error("[render-photo-prints] background failed", err),
        ),
      );
      return new Response(JSON.stringify({ accepted: true, order_item_id: orderItemId }), {
        status: 202,
        headers: jsonHeaders,
      });
    }

    const result = await renderForOrderItem(supabase, orderItemId);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (err: any) {
    console.error("[render-photo-prints] error", err);
    return new Response(JSON.stringify({ error: err?.message ?? "render failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
