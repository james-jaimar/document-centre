import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * All branches the current user has manager-level access to,
 * across every tenant they're a member of.
 *
 * A user is considered a "multi-branch operator" when this list has 2+ entries.
 */
export interface LinkedBranch {
  id: string;
  name: string;
  slug: string;
  tenant_id: string;
  tenant_name: string;
  role: string;
  is_primary: boolean;
}

const MANAGER_ROLES = ["owner", "admin", "branch_manager"];

export function useLinkedBranches() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: ["linked-branches", userId],
    queryFn: async (): Promise<LinkedBranch[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("tenant_memberships")
        .select(
          `role, branch_id, tenant_id, is_primary_branch,
           branches:branch_id ( id, name, slug ),
           tenants:tenant_id ( id, name )`
        )
        .eq("profile_id", userId)
        .eq("is_active", true)
        .in("role", MANAGER_ROLES);
      if (error) throw error;

      const seen = new Set<string>();
      const out: LinkedBranch[] = [];
      for (const row of (data ?? []) as any[]) {
        // Owner/admin without a branch_id => access to all branches in tenant.
        if (!row.branch_id) continue;
        if (!row.branches) continue;
        if (seen.has(row.branches.id)) continue;
        seen.add(row.branches.id);
        out.push({
          id: row.branches.id,
          name: row.branches.name,
          slug: row.branches.slug,
          tenant_id: row.tenant_id,
          tenant_name: row.tenants?.name ?? "",
          role: row.role,
          is_primary: !!row.is_primary_branch,
        });
      }
      out.sort((a, b) => {
        if (a.tenant_name !== b.tenant_name) return a.tenant_name.localeCompare(b.tenant_name);
        return a.name.localeCompare(b.name);
      });
      return out;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const branches = query.data ?? [];
  return {
    ...query,
    branches,
    branchIds: branches.map((b) => b.id),
    isMultiBranchOperator: branches.length >= 2,
  };
}
