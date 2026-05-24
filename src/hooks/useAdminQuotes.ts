import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch } from "@/contexts/BranchContext";

const QK = "admin_quotes";

export function useAdminQuotes() {
  const { tenantId } = useTenantContext();
  return useQuery({
    queryKey: [QK, tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id, quote_number, name, quote_status, valid_until, total_amount, currency, customer_email, customer_name, created_at, created_via")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAdminQuote(id: string | undefined) {
  return useQuery({
    queryKey: [QK, "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*, quote_items(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminUpdateQuoteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "declined" | "void" | "approved" }) => {
      const patch: Record<string, unknown> = { quote_status: status };
      if (status === "declined") patch.declined_at = new Date().toISOString();
      if (status === "approved") patch.approved_at = new Date().toISOString();
      const { error } = await supabase.from("quotes").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}

export interface BlankQuoteLineItem {
  product_name: string;
  job_name?: string;
  quantity: number;
  unit_price: number;
}

export interface CreateBlankQuoteInput {
  customer_email: string;
  customer_name?: string;
  name?: string;
  validity_days?: number;
  notes?: string;
  items: BlankQuoteLineItem[];
}

const DEFAULT_VALIDITY_DAYS = 30;

export function useAdminCreateBlankQuote() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { tenantId, appId } = useTenantContext();
  const { activeBranch } = useBranch();

  return useMutation({
    mutationFn: async (input: CreateBlankQuoteInput) => {
      if (!user) throw new Error("Not authenticated");
      if (!tenantId || !appId) throw new Error("No tenant context");
      if (!input.items.length) throw new Error("Add at least one line item");
      if (!input.customer_email?.trim()) throw new Error("Customer email is required");

      // Try to match existing customer profile by email (best-effort).
      const { data: matchedProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", input.customer_email.trim().toLowerCase())
        .maybeSingle();

      const { data: numberData, error: numErr } = await supabase
        .rpc("generate_quote_number", { p_app_id: appId });
      if (numErr) throw numErr;
      const quoteNumber = numberData as unknown as string;

      const validityDays = input.validity_days && input.validity_days > 0
        ? input.validity_days
        : DEFAULT_VALIDITY_DAYS;
      const validUntil = new Date(Date.now() + validityDays * 86400_000).toISOString();

      const subtotal = input.items.reduce(
        (s, it) => s + Number(it.unit_price) * Number(it.quantity),
        0,
      );

      const { data: quote, error: qErr } = await supabase
        .from("quotes")
        .insert({
          app_id: appId,
          tenant_id: tenantId,
          branch_id: activeBranch?.id ?? null,
          quote_number: quoteNumber,
          name: input.name ?? null,
          customer_profile_id: matchedProfile?.id ?? null,
          customer_email: input.customer_email.trim(),
          customer_name: input.customer_name?.trim() || null,
          created_by_profile_id: user.id,
          created_via: "tenant_sales",
          quote_status: "active" as any,
          valid_until: validUntil,
          currency: "ZAR",
          subtotal,
          total_amount: subtotal,
          notes_internal: input.notes ?? null,
        } as any)
        .select("id, quote_number")
        .single();
      if (qErr) throw qErr;

      const rows = input.items.map((it, idx) => ({
        quote_id: quote.id,
        sequence_no: idx + 1,
        product_name: it.product_name,
        job_name: it.job_name ?? null,
        quantity: it.quantity,
        unit_price: it.unit_price,
        net_price: Number(it.unit_price) * Number(it.quantity),
        gross_price: Number(it.unit_price) * Number(it.quantity),
      }));
      const { error: itemsErr } = await supabase.from("quote_items").insert(rows as any);
      if (itemsErr) throw itemsErr;

      return quote;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}
