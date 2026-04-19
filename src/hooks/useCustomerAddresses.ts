import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";

export interface CustomerAddress {
  id: string;
  tenant_id: string;
  app_id: string;
  customer_profile_id: string;
  label: string | null;
  address_type: string;
  is_default: boolean;
  contact_name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  line1: string | null;
  line2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  instructions: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomerAddressInput = Partial<Omit<CustomerAddress, "id" | "created_at" | "updated_at" | "tenant_id" | "app_id" | "customer_profile_id">>;

export function useCustomerAddresses(customerProfileId: string | undefined) {
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["customer-addresses", tenantId, appId, customerProfileId],
    enabled: !!tenantId && !!appId && !!customerProfileId,
    queryFn: async (): Promise<CustomerAddress[]> => {
      const { data, error } = await supabase
        .from("customer_addresses")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("app_id", appId!)
        .eq("customer_profile_id", customerProfileId!)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CustomerAddress[];
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["customer-addresses", tenantId, appId, customerProfileId] });

  const create = useMutation({
    mutationFn: async (input: CustomerAddressInput) => {
      if (!tenantId || !appId || !customerProfileId) throw new Error("Missing context");
      const { error } = await supabase.from("customer_addresses").insert({
        tenant_id: tenantId,
        app_id: appId,
        customer_profile_id: customerProfileId,
        ...input,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Address added");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to add address"),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CustomerAddressInput }) => {
      const { error } = await supabase.from("customer_addresses").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Address updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update address"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_addresses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Address removed");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to remove address"),
  });

  return { ...query, create, update, remove };
}
