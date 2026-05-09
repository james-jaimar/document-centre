import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GatewayProvider = "stripe" | "payfast";
export type GatewayMode = "test" | "live";

export interface TenantPaymentGateway {
  id: string;
  tenant_id: string;
  provider: GatewayProvider;
  is_enabled: boolean;
  display_label: string | null;
  credentials_secret_id: string | null;
  mode: GatewayMode;
  sort_order: number;
}

export interface BranchPaymentGateway {
  id: string;
  branch_id: string;
  provider: GatewayProvider;
  credentials_secret_id: string | null;
  mode: GatewayMode;
}

export function useTenantPaymentGateways(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["tenant-payment-gateways", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_payment_gateways")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("sort_order");
      if (error) throw error;
      return data as TenantPaymentGateway[];
    },
  });
}

export function useBranchPaymentGateways(branchId: string | null | undefined) {
  return useQuery({
    queryKey: ["branch-payment-gateways", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_payment_gateways")
        .select("*")
        .eq("branch_id", branchId!);
      if (error) throw error;
      return data as BranchPaymentGateway[];
    },
  });
}

export interface SaveCredentialsInput {
  scope: "tenant" | "branch";
  scope_id: string;
  provider: GatewayProvider;
  mode: GatewayMode;
  display_label?: string;
  // Stripe
  secret_key?: string;
  publishable_key?: string;
  webhook_secret?: string;
  // PayFast
  merchant_id?: string;
  merchant_key?: string;
  passphrase?: string;
}

export function useSavePaymentCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveCredentialsInput) => {
      const { data, error } = await supabase.functions.invoke("payments-save-credentials", { body: input });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      if (vars.scope === "tenant") qc.invalidateQueries({ queryKey: ["tenant-payment-gateways", vars.scope_id] });
      else qc.invalidateQueries({ queryKey: ["branch-payment-gateways", vars.scope_id] });
    },
  });
}

export function useToggleTenantGatewayEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId, provider, isEnabled }: { tenantId: string; provider: GatewayProvider; isEnabled: boolean }) => {
      // Upsert on (tenant_id, provider)
      const { data: existing } = await supabase
        .from("tenant_payment_gateways")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("provider", provider)
        .maybeSingle();
      if (existing) {
        const { error } = await supabase.from("tenant_payment_gateways").update({ is_enabled: isEnabled }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenant_payment_gateways").insert({ tenant_id: tenantId, provider, is_enabled: isEnabled });
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["tenant-payment-gateways", vars.tenantId] }),
  });
}
