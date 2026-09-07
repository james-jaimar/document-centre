/**
 * Photo library (Pexels) settings — resolved per branch, then tenant, through
 * the SECURITY DEFINER resolver RPCs so anonymous storefront sessions can read
 * them without direct table access.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch } from "@/contexts/BranchContext";

export const PHOTO_LIBRARY_CATEGORY = "photo_library";

export interface PhotoLibrarySettings {
  /** Master on/off switch for this tenant. */
  enabled: boolean;
  /** Quick-pick search chips shown above the results. */
  categories: string[];
  /** Search shown when the picker first opens (blank = Pexels curated feed). */
  defaultQuery: string;
  /** "auto" matches the shape of the picture area; "any" shows everything. */
  orientationMode: "auto" | "any";
  /** Pexels locale, e.g. en-US. Blank = Pexels default. */
  locale: string;
  /** Optional Pexels colour filter (named colour or hex). Blank = any. */
  colour: string;
  /** Pexels minimum size bucket: large | medium | small. */
  size: "large" | "medium" | "small";
  /** Results per page (Pexels max 80; we cap at 40). */
  perPage: number;
  /** DPI at or above which a photo is badged "Excellent". */
  excellentDpi: number;
  /** DPI at or above which a photo is badged "Good". */
  goodDpi: number;
  /** Hide photos below the "Good" threshold instead of showing them greyed. */
  hideBelowMinimum: boolean;
  /** Per-product overrides keyed by product family id. true/false wins over `enabled`. */
  productOverrides: Record<string, boolean>;
}

export const PHOTO_LIBRARY_DEFAULTS: PhotoLibrarySettings = {
  enabled: true,
  categories: [
    "Landscapes",
    "Wildlife",
    "Cape Town",
    "Ocean",
    "Mountains",
    "Abstract",
    "Seasons",
    "Flowers",
    "City",
    "Minimal",
  ],
  defaultQuery: "",
  orientationMode: "auto",
  locale: "",
  colour: "",
  size: "large",
  perPage: 24,
  excellentDpi: 240,
  goodDpi: 150,
  hideBelowMinimum: true,
};

function unwrap(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  // The resolver returns jsonb; strings arrive quoted in some paths.
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

async function resolveKey(
  branchId: string | null | undefined,
  tenantId: string | null | undefined,
  key: string,
): Promise<unknown> {
  if (branchId) {
    const { data } = await supabase.rpc("resolve_branch_setting" as any, {
      p_branch_id: branchId,
      p_category: PHOTO_LIBRARY_CATEGORY,
      p_key: key,
    });
    const v = unwrap(data);
    if (v !== null && v !== undefined) return v;
  }
  if (tenantId) {
    const { data } = await supabase.rpc("resolve_tenant_setting" as any, {
      p_tenant_id: tenantId,
      p_category: PHOTO_LIBRARY_CATEGORY,
      p_key: key,
    });
    return unwrap(data);
  }
  return null;
}

const asBool = (v: unknown, fb: boolean) =>
  typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : fb;
const asNum = (v: unknown, fb: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fb;
};
const asStr = (v: unknown, fb: string) => (typeof v === "string" ? v : fb);

export async function fetchPhotoLibrarySettings(
  branchId: string | null | undefined,
  tenantId: string | null | undefined,
): Promise<PhotoLibrarySettings> {
  const keys = [
    "enabled",
    "categories",
    "default_query",
    "orientation_mode",
    "locale",
    "colour",
    "size",
    "per_page",
    "excellent_dpi",
    "good_dpi",
    "hide_below_minimum",
  ] as const;

  const values = await Promise.all(keys.map((k) => resolveKey(branchId, tenantId, k)));
  const v = Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<string, unknown>;

  const cats = Array.isArray(v.categories)
    ? (v.categories as unknown[]).map(String).filter(Boolean)
    : typeof v.categories === "string" && v.categories
      ? String(v.categories)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : PHOTO_LIBRARY_DEFAULTS.categories;

  const orientationMode = v.orientation_mode === "any" ? "any" : "auto";
  const size = ["large", "medium", "small"].includes(String(v.size))
    ? (String(v.size) as PhotoLibrarySettings["size"])
    : PHOTO_LIBRARY_DEFAULTS.size;

  return {
    enabled: asBool(v.enabled, PHOTO_LIBRARY_DEFAULTS.enabled),
    categories: cats,
    defaultQuery: asStr(v.default_query, PHOTO_LIBRARY_DEFAULTS.defaultQuery),
    orientationMode,
    locale: asStr(v.locale, PHOTO_LIBRARY_DEFAULTS.locale),
    colour: asStr(v.colour, PHOTO_LIBRARY_DEFAULTS.colour),
    size,
    perPage: Math.min(40, asNum(v.per_page, PHOTO_LIBRARY_DEFAULTS.perPage)),
    excellentDpi: asNum(v.excellent_dpi, PHOTO_LIBRARY_DEFAULTS.excellentDpi),
    goodDpi: asNum(v.good_dpi, PHOTO_LIBRARY_DEFAULTS.goodDpi),
    hideBelowMinimum: asBool(v.hide_below_minimum, PHOTO_LIBRARY_DEFAULTS.hideBelowMinimum),
  };
}

export function usePhotoLibrarySettings() {
  const { tenantId } = useTenantContext();
  const { activeBranch } = useBranch();
  const branchId = activeBranch?.id ?? null;

  const query = useQuery({
    queryKey: ["photo-library-settings", tenantId, branchId],
    enabled: !!tenantId || !!branchId,
    queryFn: () => fetchPhotoLibrarySettings(branchId, tenantId),
    staleTime: 5 * 60 * 1000,
  });

  return {
    settings: query.data ?? PHOTO_LIBRARY_DEFAULTS,
    isLoading: query.isLoading,
  };
}
