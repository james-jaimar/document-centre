/**
 * Packaging / billable-weight settings, resolved branch → tenant → platform
 * default. Read through the SECURITY DEFINER `resolve_branch_setting` RPC so
 * anonymous storefront shoppers can be quoted delivery too.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_WEIGHT_SETTINGS,
  mergeWeightSettings,
  type WeightSettings,
} from "@/lib/weight/resolveItemWeight";

export const WEIGHT_SETTINGS_CATEGORY = "delivery";

export const WEIGHT_SETTING_KEYS = {
  packagingGrams: "packaging_grams",
  packagingPct: "packaging_pct",
  minBillableKg: "min_billable_kg",
  volumetricDivisor: "volumetric_divisor",
} as const;

function unwrapNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(typeof raw === "string" ? raw.replace(/"/g, "") : raw);
  return Number.isFinite(n) ? n : null;
}

/** Fetch the effective settings for a branch (falls back to tenant then defaults). */
export async function fetchWeightSettings(
  branchId: string | null | undefined,
  tenantId?: string | null,
): Promise<WeightSettings> {
  const keys = Object.values(WEIGHT_SETTING_KEYS);

  const read = async (key: string): Promise<number | null> => {
    if (branchId) {
      const { data } = await supabase.rpc("resolve_branch_setting" as any, {
        p_branch_id: branchId,
        p_category: WEIGHT_SETTINGS_CATEGORY,
        p_key: key,
      });
      const n = unwrapNumber(data);
      if (n !== null) return n;
    }
    if (tenantId) {
      const { data } = await supabase.rpc("resolve_tenant_setting" as any, {
        p_tenant_id: tenantId,
        p_category: WEIGHT_SETTINGS_CATEGORY,
        p_key: key,
      });
      return unwrapNumber(data);
    }
    return null;
  };

  const [packagingGrams, packagingPct, minBillableKg, volumetricDivisor] = await Promise.all(
    keys.map((k) => read(k)),
  );

  return mergeWeightSettings({
    packagingGrams: packagingGrams ?? undefined,
    packagingPct: packagingPct ?? undefined,
    minBillableKg: minBillableKg ?? undefined,
    volumetricDivisor: volumetricDivisor ?? undefined,
  });
}

export function useWeightSettings(
  branchId: string | null | undefined,
  tenantId?: string | null,
) {
  return useQuery({
    queryKey: ["weight_settings", branchId ?? null, tenantId ?? null],
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchWeightSettings(branchId, tenantId),
    placeholderData: DEFAULT_WEIGHT_SETTINGS,
  });
}
