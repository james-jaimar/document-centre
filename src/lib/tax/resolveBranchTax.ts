import { supabase } from "@/integrations/supabase/client";

/**
 * Effective tax configuration for an order. Branch values override tenant
 * defaults; null/undefined branch values fall through to the tenant.
 */
export interface ResolvedTax {
  enabled: boolean;
  rate: number; // percent, e.g. 15
  inclusive: boolean;
  label: string;
}

export const DEFAULT_TAX: ResolvedTax = {
  enabled: false,
  rate: 15,
  inclusive: false,
  label: "VAT",
};

/**
 * Read both tenant `financial` settings and branch-level overrides from
 * `branch_settings` (JSONB rows under the `financial` category) and merge.
 *
 * The tenant tab in Admin uses keys: `tax_label`, `tax_rate`, `tax_inclusive`,
 * `tax_enabled`. The branch override mirror uses the same keys.
 */
export async function resolveBranchTax(
  tenantId: string | null | undefined,
  branchId: string | null | undefined,
): Promise<ResolvedTax> {
  if (!tenantId) return DEFAULT_TAX;

  const tenantQ = supabase
    .from("tenant_settings")
    .select("setting_key, setting_value")
    .eq("tenant_id", tenantId)
    .eq("category", "financial");

  const branchQ = branchId
    ? supabase
        .from("branch_settings" as any)
        .select("setting_key, setting_value")
        .eq("branch_id", branchId)
        .eq("category", "financial")
    : Promise.resolve({ data: [] as any[], error: null });

  const [{ data: tenantRows }, { data: branchRows }] = await Promise.all([
    tenantQ,
    branchQ as any,
  ]);

  const toMap = (rows: any[] | null | undefined) => {
    const m: Record<string, unknown> = {};
    for (const r of rows ?? []) m[r.setting_key] = r.setting_value;
    return m;
  };

  const t = toMap(tenantRows as any[]);
  const b = toMap(branchRows as any[]);

  const pick = <T>(k: string, fallback: T): T => {
    if (b[k] !== undefined && b[k] !== null) return b[k] as T;
    if (t[k] !== undefined && t[k] !== null) return t[k] as T;
    return fallback;
  };

  const rate = Number(pick("tax_rate", DEFAULT_TAX.rate)) || 0;
  // Default `tax_enabled` to true when a non-zero rate is configured at any
  // level — matches the historical behaviour where presence of a rate meant
  // "tax is on".
  const enabled = pick<boolean>("tax_enabled", rate > 0);

  return {
    enabled: !!enabled && rate > 0,
    rate,
    inclusive: !!pick("tax_inclusive", DEFAULT_TAX.inclusive),
    label: String(pick("tax_label", DEFAULT_TAX.label)),
  };
}

/**
 * Compute the VAT portion for a given subtotal under a resolved tax config.
 * Inclusive mode: VAT is the tax-portion already embedded in the subtotal.
 * Exclusive mode: VAT is added on top.
 */
export function computeVat(subtotal: number, tax: ResolvedTax): number {
  if (!tax.enabled || tax.rate <= 0 || subtotal <= 0) return 0;
  if (tax.inclusive) {
    const net = subtotal / (1 + tax.rate / 100);
    return Math.round((subtotal - net) * 100) / 100;
  }
  return Math.round(subtotal * (tax.rate / 100) * 100) / 100;
}
