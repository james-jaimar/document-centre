import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

export interface BranchCustomerRow {
  profile_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
}

export function useBranchCustomers() {
  const { branchId } = useTenantContext();

  return useQuery({
    queryKey: ["branch-customers", branchId],
    enabled: !!branchId,
    queryFn: async (): Promise<BranchCustomerRow[]> => {
      const { data, error } = await supabase.rpc("get_branch_customers", {
        _branch_id: branchId!,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        profile_id: r.profile_id,
        display_name: r.display_name,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        phone: r.phone,
        order_count: Number(r.order_count ?? 0),
        total_spent: Number(r.total_spent ?? 0),
        last_order_at: r.last_order_at,
      }));
    },
  });
}
