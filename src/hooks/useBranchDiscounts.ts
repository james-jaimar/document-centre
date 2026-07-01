import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BranchDiscount = {
  id: string;
  branch_id: string;
  tenant_id: string;
  kind: "coupon" | "voucher" | "automatic";
  code: string | null;
  name: string;
  description: string | null;
  value_type: "percentage" | "fixed" | "free_delivery" | "free_item";
  value_amount: number;
  currency_code: string;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  max_per_customer: number | null;
  min_order_subtotal: number | null;
  first_time_customer_only: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DiscountInput = Partial<Omit<BranchDiscount, "id" | "created_at" | "updated_at">> & {
  branch_id: string;
  tenant_id: string;
  name: string;
  kind: BranchDiscount["kind"];
  value_type: BranchDiscount["value_type"];
};

export function useBranchDiscounts(branchId: string | null | undefined) {
  return useQuery({
    queryKey: ["branch-discounts", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_discounts" as any)
        .select("*")
        .eq("branch_id", branchId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BranchDiscount[];
    },
  });
}

export function useBranchDiscountRedemptions(discountId: string | null) {
  return useQuery({
    queryKey: ["branch-discount-redemptions", discountId],
    enabled: !!discountId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_discount_redemptions" as any)
        .select("id, order_id, customer_email, amount_applied, redeemed_at")
        .eq("discount_id", discountId!)
        .order("redeemed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveBranchDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DiscountInput & { id?: string }) => {
      const payload: Record<string, unknown> = {
        branch_id: input.branch_id,
        tenant_id: input.tenant_id,
        kind: input.kind,
        code: input.code ? input.code.trim().toUpperCase() : null,
        name: input.name,
        description: input.description ?? null,
        value_type: input.value_type,
        value_amount: input.value_amount ?? 0,
        currency_code: input.currency_code ?? "ZAR",
        starts_at: input.starts_at ?? null,
        ends_at: input.ends_at ?? null,
        max_redemptions: input.max_redemptions ?? null,
        max_per_customer: input.max_per_customer ?? null,
        min_order_subtotal: input.min_order_subtotal ?? null,
        first_time_customer_only: input.first_time_customer_only ?? false,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from("branch_discounts" as any)
          .update(payload)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("branch_discounts" as any)
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["branch-discounts", v.branch_id] });
    },
  });
}

export function useDeleteBranchDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; branch_id: string }) => {
      const { error } = await supabase.from("branch_discounts" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["branch-discounts", v.branch_id] });
    },
  });
}

export function useToggleBranchDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean; branch_id: string }) => {
      const { error } = await supabase
        .from("branch_discounts" as any)
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["branch-discounts", v.branch_id] });
    },
  });
}
