import type { QuantityBlock } from "@/hooks/useProductFamilies";

/**
 * Resolve the effective pack pricing ladder using scope precedence:
 *   branch (if any rows)  >  tenant (if any rows)  >  master
 *
 * Whole-set override, not per-row merge — matches how admins think about
 * a pack ladder ("this branch runs different pack prices").
 */
export function resolvePackPricing(input: {
  master: QuantityBlock[] | null | undefined;
  tenant?: QuantityBlock[] | null;
  branch?: QuantityBlock[] | null;
}): QuantityBlock[] {
  const { master, tenant, branch } = input;
  if (Array.isArray(branch) && branch.length > 0) return branch;
  if (Array.isArray(tenant) && tenant.length > 0) return tenant;
  return Array.isArray(master) ? master : [];
}
