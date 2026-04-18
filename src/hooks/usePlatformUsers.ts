import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformUserRow {
  profile_id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  created_at: string;
  memberships: Array<{
    membership_id: string;
    tenant_id: string;
    tenant_name: string;
    tenant_slug: string;
    app_id: string;
    role: string;
    is_active: boolean;
  }>;
}

const QUERY_KEY = ["platform-users"];

export function usePlatformUsers(search: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, search],
    queryFn: async () => {
      // 1. Find all profile IDs that have the platform_admin role
      const { data: adminRoles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "platform_admin");
      if (rolesErr) throw rolesErr;

      const adminIds = (adminRoles ?? []).map((r) => r.user_id);
      if (!adminIds.length) return [];

      // 2. Fetch only those profiles
      let q = supabase
        .from("profiles")
        .select("id, email, display_name, first_name, last_name, is_active, created_at")
        .in("id", adminIds)
        .order("created_at", { ascending: false })
        .limit(500);

      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(`email.ilike.${term},display_name.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`);
      }

      const { data: profiles, error } = await q;
      if (error) throw error;
      if (!profiles?.length) return [];

      // 3. Memberships across all tenants (informational)
      const profileIds = profiles.map((p) => p.id);
      const { data: memberships } = await supabase
        .from("tenant_memberships")
        .select("id, profile_id, tenant_id, app_id, role, is_active")
        .in("profile_id", profileIds);

      // 4. Tenant lookup
      const tenantIds = [...new Set((memberships ?? []).map((m) => m.tenant_id))];
      let tenants: Array<{ id: string; name: string; slug: string }> = [];
      if (tenantIds.length) {
        const { data } = await supabase
          .from("tenants")
          .select("id, name, slug")
          .in("id", tenantIds);
        tenants = (data ?? []) as Array<{ id: string; name: string; slug: string }>;
      }

      const tenantMap = new Map(tenants.map((t) => [t.id, t] as const));

      return profiles.map<PlatformUserRow>((p) => ({
        profile_id: p.id,
        email: p.email,
        display_name: p.display_name,
        first_name: p.first_name,
        last_name: p.last_name,
        is_active: p.is_active,
        created_at: p.created_at,
        memberships: (memberships ?? [])
          .filter((m) => m.profile_id === p.id)
          .map((m) => {
            const t = tenantMap.get(m.tenant_id);
            return {
              membership_id: m.id,
              tenant_id: m.tenant_id,
              tenant_name: t?.name ?? "Unknown",
              tenant_slug: t?.slug ?? "",
              app_id: m.app_id,
              role: m.role,
              is_active: m.is_active,
            };
          }),
      }));
    },
  });
}
