import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";

export interface SavedOrder {
  id: string;
  profile_id: string;
  tenant_id: string;
  app_id: string;
  branch_id: string | null;
  name: string;
  notes: string | null;
  source_order_id: string | null;
  snapshot: any;
  created_at: string;
  updated_at: string;
}

export function useCustomerSavedOrders() {
  const { user } = useAuth();
  const { tenantId } = useTenantContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["customer-saved-orders", user?.id, tenantId],
    enabled: !!user?.id && !!tenantId,
    queryFn: async (): Promise<SavedOrder[]> => {
      const { data, error } = await supabase
        .from("customer_saved_orders")
        .select("*")
        .eq("profile_id", user!.id)
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SavedOrder[];
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["customer-saved-orders", user?.id, tenantId] });

  const create = useMutation({
    mutationFn: async (input: {
      name: string;
      notes?: string | null;
      source_order_id?: string | null;
      app_id: string;
      branch_id?: string | null;
      snapshot?: any;
    }) => {
      if (!user?.id || !tenantId) throw new Error("Missing context");
      const { error } = await supabase.from("customer_saved_orders").insert({
        profile_id: user.id,
        tenant_id: tenantId,
        app_id: input.app_id,
        branch_id: input.branch_id ?? null,
        name: input.name,
        notes: input.notes ?? null,
        source_order_id: input.source_order_id ?? null,
        snapshot: input.snapshot ?? {},
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Saved as template");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save template"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_saved_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Template removed");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to remove template"),
  });

  const rename = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from("customer_saved_orders")
        .update({ name })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e.message ?? "Failed to rename"),
  });

  return { ...query, create, remove, rename };
}
