import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";

export interface CustomerAccountSettings {
  vat_number?: string | null;
  is_account_customer?: boolean;
  credit_limit?: number | null;
  payment_terms_days?: number | null;
  default_discount_pct?: number | null;
  notes?: string | null;
}

export function useUpdateCustomerAccount(customerProfileId: string | undefined) {
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: CustomerAccountSettings) => {
      if (!tenantId || !appId || !customerProfileId) throw new Error("Missing context");

      // fetch current metadata
      const { data: existing, error: readErr } = await supabase
        .from("tenant_memberships")
        .select("id, metadata")
        .eq("tenant_id", tenantId)
        .eq("app_id", appId)
        .eq("profile_id", customerProfileId)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!existing) throw new Error("Membership not found");

      const merged = { ...((existing.metadata as any) ?? {}), ...patch };
      const { error } = await supabase
        .from("tenant_memberships")
        .update({ metadata: merged })
        .eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-customer", tenantId, customerProfileId] });
      toast.success("Account settings saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save settings"),
  });
}
