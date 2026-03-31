import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantMemberRow {
  id: string;
  profile_id: string;
  app_id: string;
  tenant_id: string;
  branch_id: string | null;
  role: string;
  is_active: boolean;
  can_view_all_orders: boolean;
  created_at: string;
  // joined from profiles
  profiles: {
    display_name: string | null;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

const QUERY_KEY = ["tenant-members"];

export function useTenantMembers(tenantId: string | null, appId: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, tenantId, appId],
    queryFn: async () => {
      if (!tenantId || !appId) return [];
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select(`
          id, profile_id, app_id, tenant_id, branch_id, role,
          is_active, can_view_all_orders, created_at,
          profiles:profile_id (display_name, email, first_name, last_name, avatar_url)
        `)
        .eq("tenant_id", tenantId)
        .eq("app_id", appId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TenantMemberRow[];
    },
    enabled: !!tenantId && !!appId,
  });
}

export function useCreateTenantMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      profile_id: string;
      app_id: string;
      tenant_id: string;
      role: string;
      branch_id?: string | null;
      can_view_all_orders?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateTenantMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      role?: string;
      branch_id?: string | null;
      is_active?: boolean;
      can_view_all_orders?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("tenant_memberships")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteTenantMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tenant_memberships")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
