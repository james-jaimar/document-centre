import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranchContext } from "@/contexts/BranchContext";

export const BILLING_SETTINGS_CATEGORY = "financial";
export const REQUIRE_BILLING_ADDRESS_KEY = "require_billing_address";

function unwrapBoolean(raw: unknown): boolean | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  }
  return null;
}

/**
 * Whether this tenant (or branch) forces the customer to supply a billing
 * address before an order can be placed. Read through the resolver RPCs so
 * anonymous / customer sessions can see it without direct table access.
 */
export async function fetchRequireBillingAddress(
  branchId: string | null | undefined,
  tenantId: string | null | undefined,
): Promise<boolean> {
  if (branchId) {
    const { data } = await supabase.rpc("resolve_branch_setting" as any, {
      p_branch_id: branchId,
      p_category: BILLING_SETTINGS_CATEGORY,
      p_key: REQUIRE_BILLING_ADDRESS_KEY,
    });
    const v = unwrapBoolean(data);
    if (v !== null) return v;
  }
  if (tenantId) {
    const { data } = await supabase.rpc("resolve_tenant_setting" as any, {
      p_tenant_id: tenantId,
      p_category: BILLING_SETTINGS_CATEGORY,
      p_key: REQUIRE_BILLING_ADDRESS_KEY,
    });
    const v = unwrapBoolean(data);
    if (v !== null) return v;
  }
  return false;
}

export function useRequireBillingAddress() {
  const { tenantId } = useTenantContext();
  let branchId: string | null = null;
  try {
    branchId = useBranchContext()?.activeBranch?.id ?? null;
  } catch {
    branchId = null;
  }

  const query = useQuery({
    queryKey: ["require-billing-address", tenantId, branchId],
    enabled: !!tenantId || !!branchId,
    queryFn: () => fetchRequireBillingAddress(branchId, tenantId),
    staleTime: 5 * 60 * 1000,
  });

  return { required: query.data === true, isLoading: query.isLoading };
}
