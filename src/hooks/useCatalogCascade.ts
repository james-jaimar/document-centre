import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Master Catalogue cascade: copy-down from master → tenant → branch.
 * Each RPC is idempotent. "Resync" deletes the local scope and re-clones.
 */

function invalidateCatalog(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["catalog_sizes"] });
  qc.invalidateQueries({ queryKey: ["catalog_print_attrs"] });
  qc.invalidateQueries({ queryKey: ["catalog_papers"] });
  qc.invalidateQueries({ queryKey: ["catalog_finishing"] });
  qc.invalidateQueries({ queryKey: ["catalog_paper_prices"] });
  qc.invalidateQueries({ queryKey: ["catalog_finishing_prices"] });
  qc.invalidateQueries({ queryKey: ["product_catalog_links"] });
}

export function useCloneMasterCatalogToTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenantId: string) => {
      const { error } = await supabase.rpc("clone_master_catalog_to_tenant" as any, {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useResyncTenantCatalogFromMaster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenantId: string) => {
      const { error } = await supabase.rpc("resync_tenant_catalog_from_master" as any, {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useCloneTenantCatalogToBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (branchId: string) => {
      const { error } = await supabase.rpc("clone_tenant_catalog_to_branch" as any, {
        p_branch_id: branchId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateCatalog(qc),
  });
}

export function useResyncBranchCatalogFromTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (branchId: string) => {
      const { error } = await supabase.rpc("resync_branch_catalog_from_tenant" as any, {
        p_branch_id: branchId,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateCatalog(qc),
  });
}
