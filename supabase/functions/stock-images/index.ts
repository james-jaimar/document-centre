/**
 * Pexels stock photo library.
 *
 *  • search — proxies the Pexels search/curated API with the server-held key
 *    and returns a trimmed result set (id, thumbnail, size, photographer).
 *  • fetch  — streams one photo's original bytes back to the browser so the
 *    existing upload path (S3 + documents row) handles it exactly like a
 *    customer file. Only images.pexels.com URLs are allowed.
 *
 * The API key never reaches the browser.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PEXELS_API = "https://api.pexels.com/v1";
const ALLOWED_PHOTO_HOST = "images.pexels.com";

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  alt: string | null;
  src: Record<string, string>;
}

function slim(p: PexelsPhoto) {
  return {
    id: p.id,
    width: p.width,
    height: p.height,
    thumb: p.src?.medium ?? p.src?.small ?? p.src?.tiny ?? "",
    preview: p.src?.large ?? p.src?.medium ?? "",
    original: p.src?.original ?? "",
    photographer: p.photographer,
    photographer_url: p.photographer_url,
    page_url: p.url,
    alt: p.alt ?? "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const key = Deno.env.get("PEXELS_API_KEY");
  if (!key) return json({ error: "Photo library is not configured" }, 500);

  // Signed-in (including anonymous storefront sessions) callers only.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "Not signed in" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const action = String(body.action ?? "");

  if (action === "search") {
    const query = String(body.query ?? "").trim().slice(0, 120);
    const page = Math.max(1, Math.min(50, Number(body.page ?? 1) || 1));
    const perPage = Math.max(1, Math.min(40, Number(body.per_page ?? 24) || 24));
    const orientation = ["landscape", "portrait", "square"].includes(String(body.orientation))
      ? String(body.orientation)
      : undefined;

    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (orientation) params.set("orientation", orientation);
    // Minimum photo size bucket — tenant-configurable, defaults to large.
    const size = ["large", "medium", "small"].includes(String(body.size))
      ? String(body.size)
      : "large";
    params.set("size", size);
    const locale = String(body.locale ?? "").trim().slice(0, 10);
    if (/^[a-zA-Z]{2}-[a-zA-Z]{2}$/.test(locale)) params.set("locale", locale);
    const colour = String(body.colour ?? "").trim().slice(0, 20);
    if (/^(#[0-9a-fA-F]{6}|[a-zA-Z]{3,20})$/.test(colour)) params.set("color", colour);

    let url: string;
    if (query) {
      params.set("query", query);
      url = `${PEXELS_API}/search?${params}`;
    } else {
      url = `${PEXELS_API}/curated?${params}`;
    }

    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) {
      const details = await res.text();
      console.error(`[stock-images] pexels search failed [${res.status}]: ${details}`);
      return json({ error: "Photo search failed", status: res.status, details }, res.status);
    }
    const data = await res.json();
    return json({
      photos: (data.photos ?? []).map(slim),
      page,
      total: data.total_results ?? null,
      has_more: Boolean(data.next_page),
    });
  }

  if (action === "fetch") {
    const raw = String(body.url ?? "");
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return json({ error: "Invalid photo" }, 400);
    }
    if (parsed.protocol !== "https:" || parsed.hostname !== ALLOWED_PHOTO_HOST) {
      return json({ error: "Invalid photo" }, 400);
    }
    const res = await fetch(parsed.toString());
    if (!res.ok || !res.body) {
      console.error(`[stock-images] photo download failed [${res.status}] ${parsed.pathname}`);
      return json({ error: "Photo download failed", status: res.status }, 502);
    }
    const contentLength = res.headers.get("Content-Length");
    return new Response(res.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": res.headers.get("Content-Type") ?? "image/jpeg",
        "Content-Disposition": "attachment",
        ...(contentLength ? { "Content-Length": contentLength } : {}),
        "Cache-Control": "no-store",
      },
    });
  }

  return json({ error: "Unknown action" }, 400);
});
