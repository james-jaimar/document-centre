import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantBranding {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  portal_name: string;
  logo_url: string;
  hero_image_url: string;
  tagline: string;
  font_heading: string;
  font_body: string;
  cta_text: string;
  landing_layout: string;
  // Facsimile fields
  facsimile_enabled: boolean;
  header_html: string;
  footer_html: string;
  header_css: string;
  footer_css: string;
  origin_url: string;
  favicon_url: string;
}

const DEFAULTS: TenantBranding = {
  primary_color: "#1a1a2e",
  secondary_color: "#16213e",
  accent_color: "#0f3460",
  portal_name: "",
  logo_url: "",
  hero_image_url: "",
  tagline: "Professional printing, delivered.",
  font_heading: "",
  font_body: "",
  cta_text: "Start Printing",
  landing_layout: "hero_centered",
  facsimile_enabled: false,
  header_html: "",
  footer_html: "",
  header_css: "",
  footer_css: "",
  origin_url: "",
  favicon_url: "",
};

const CACHE_PREFIX = "tenant_branding:";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function readBrandingCache(tenantId: string): TenantBranding | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + tenantId);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return data as TenantBranding;
  } catch {
    return null;
  }
}

function writeBrandingCache(tenantId: string, data: TenantBranding) {
  try {
    localStorage.setItem(CACHE_PREFIX + tenantId, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* ignore */
  }
}

/**
 * Public hook — fetches branding settings for a tenant by ID.
 * Uses the public RLS policy (category = 'branding', is_sensitive = false).
 *
 * Hydrates synchronously from localStorage when available so the first
 * paint after a return visit is already branded (no default-theme flash).
 */
export function useTenantBranding(tenantId: string | null) {
  return useQuery({
    queryKey: ["tenant_branding_public", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    initialData: tenantId ? readBrandingCache(tenantId) ?? undefined : undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("setting_key, setting_value")
        .eq("tenant_id", tenantId!)
        .eq("category", "branding")
        .eq("is_sensitive", false);

      if (error) throw error;

      const map: Record<string, unknown> = {};
      for (const row of data ?? []) {
        map[row.setting_key] = row.setting_value;
      }

      // Parse boolean for facsimile_enabled
      if (map.facsimile_enabled !== undefined) {
        const v = map.facsimile_enabled;
        map.facsimile_enabled = v === true || v === "true";
      }

      const resolved = {
        ...DEFAULTS,
        ...Object.fromEntries(
          Object.entries(map).filter(([, v]) => v !== null && v !== "")
        ),
      } as TenantBranding;

      if (tenantId) writeBrandingCache(tenantId, resolved);
      return resolved;
    },
  });
}
