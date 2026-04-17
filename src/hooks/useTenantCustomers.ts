import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface CustomerListRow {
  profile_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  membership_id: string;
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
}

export function useTenantCustomers() {
  const { tenantId, appId } = useTenantContext();

  return useQuery({
    queryKey: ["tenant-customers", tenantId, appId],
    enabled: !!tenantId && !!appId,
    queryFn: async (): Promise<CustomerListRow[]> => {
      const { data: memberships, error: mErr } = await supabase
        .from("tenant_memberships")
        .select("id, profile_id, is_active, profiles!inner(id, display_name, first_name, last_name, email, phone)")
        .eq("tenant_id", tenantId!)
        .eq("app_id", appId!)
        .eq("role", "customer");

      if (mErr) throw mErr;

      const rows = (memberships ?? []) as any[];
      const profileIds = rows.map((r) => r.profile_id);
      if (profileIds.length === 0) return [];

      const { data: orders } = await supabase
        .from("orders")
        .select("ordered_by_profile_id, total_amount, created_at")
        .eq("tenant_id", tenantId!)
        .in("ordered_by_profile_id", profileIds)
        .neq("order_status", "cart");

      const stats = new Map<string, { count: number; total: number; last: string | null }>();
      for (const o of orders ?? []) {
        const key = (o as any).ordered_by_profile_id as string;
        const cur = stats.get(key) ?? { count: 0, total: 0, last: null };
        cur.count += 1;
        cur.total += Number((o as any).total_amount ?? 0);
        const created = (o as any).created_at as string;
        if (!cur.last || created > cur.last) cur.last = created;
        stats.set(key, cur);
      }

      return rows.map((r) => {
        const s = stats.get(r.profile_id) ?? { count: 0, total: 0, last: null };
        const p = r.profiles;
        return {
          profile_id: r.profile_id,
          membership_id: r.id,
          is_active: r.is_active,
          display_name: p?.display_name ?? null,
          first_name: p?.first_name ?? null,
          last_name: p?.last_name ?? null,
          email: p?.email ?? null,
          phone: p?.phone ?? null,
          order_count: s.count,
          total_spent: s.total,
          last_order_at: s.last,
        };
      }).sort((a, b) => (b.last_order_at ?? "").localeCompare(a.last_order_at ?? ""));
    },
  });
}

export function useTenantCustomer(profileId: string | undefined) {
  const { tenantId, appId } = useTenantContext();

  return useQuery({
    queryKey: ["tenant-customer", tenantId, profileId],
    enabled: !!tenantId && !!profileId,
    queryFn: async () => {
      const [{ data: profile }, { data: membership }, { data: orders }, { data: addresses }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", profileId!).maybeSingle(),
        supabase
          .from("tenant_memberships")
          .select("*")
          .eq("tenant_id", tenantId!)
          .eq("app_id", appId!)
          .eq("profile_id", profileId!)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("id, order_number, created_at, total_amount, customer_status, payment_status, order_status")
          .eq("tenant_id", tenantId!)
          .eq("ordered_by_profile_id", profileId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("order_addresses")
          .select("*, orders!inner(ordered_by_profile_id, tenant_id)")
          .eq("orders.tenant_id", tenantId!)
          .eq("orders.ordered_by_profile_id", profileId!),
      ]);

      const orderIds = (orders ?? []).map((o) => o.id);
      let history: any[] = [];
      if (orderIds.length > 0) {
        const { data: h } = await supabase
          .from("status_history")
          .select("*")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
          .limit(100);
        history = h ?? [];
      }

      // Dedupe addresses by line1+postal
      const seen = new Set<string>();
      const dedupedAddresses = (addresses ?? []).filter((a: any) => {
        const k = `${a.address_type}|${a.line1 ?? ""}|${a.postal_code ?? ""}|${a.city ?? ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      return { profile, membership, orders: orders ?? [], addresses: dedupedAddresses, history };
    },
  });
}

export function useCustomerNotes(profileId: string | undefined) {
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["customer-notes", tenantId, profileId],
    enabled: !!tenantId && !!appId && !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_notes")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("customer_profile_id", profileId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      if (!tenantId || !appId || !profileId || !user) throw new Error("Missing context");
      const { error } = await supabase.from("customer_notes").insert({
        tenant_id: tenantId,
        app_id: appId,
        customer_profile_id: profileId,
        body,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-notes", tenantId, profileId] });
      toast.success("Note added");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to add note"),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-notes", tenantId, profileId] });
      toast.success("Note deleted");
    },
  });

  return { ...query, addNote, deleteNote };
}
