import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { isAnonymousUser } from "@/lib/tenantSignOut";
import { toast } from "sonner";

export interface BookshelfItem {
  id: string;
  name: string;
  sku: string | null;
  branch_id: string | null;
  revision: number;
  updated_at: string;
  snapshot: {
    product_name: string;
    /** Customer-chosen shelf; presentation only, never affects pricing. */
    shelf_category?: string | null;
    /** Customer-chosen position within the shelf; presentation only. */
    shelf_position?: number | null;
    product_family_id: string;
    spec: { page_count: number; quantity: number; is_color?: boolean; selected_options?: Record<string, string> };
    sections?: { section_type?: string | null; is_color?: boolean | null }[];
    documents: { thumbnail_urls?: string[]; page_width_mm?: number | null; page_height_mm?: number | null }[];
  };
}

export function useBookshelfEnabled() {
  const { tenantId } = useTenantContext();
  return useQuery({
    queryKey: ["bookshelf-enabled", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      if (!tenantId) return false;
      const { data, error } = await supabase.rpc("bookshelf_enabled", { p_tenant_id: tenantId });
      if (error) throw error;
      return data === true;
    },
  });
}

export function useBookshelf() {
  const { tenantId } = useTenantContext();
  const { user } = useAuth();
  const feature = useBookshelfEnabled();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["bookshelf", tenantId, user?.id],
    enabled: feature.data === true && !!user && !isAnonymousUser(user),
    queryFn: async () => {
      if (!tenantId || !user) return [];
      const { data, error } = await supabase.from("bookshelf_items")
        .select("id,name,sku,branch_id,revision,updated_at,snapshot")
        .eq("tenant_id", tenantId).eq("profile_id", user.id).is("archived_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BookshelfItem[];
    },
  });
  const operation = useMutation({
    mutationFn: async (input: { operation: "create" | "revise" | "restore" | "rename" | "archive" | "reorder"; id?: string; ids?: string[]; order_item_id?: string; name?: string; sku?: string; category?: string; quantity?: number }) => {
      if (!tenantId || !user || isAnonymousUser(user) || feature.data !== true) throw new Error("Bookshelf is unavailable");
      const { data, error } = await supabase.functions.invoke("order-engine", { body: { action: "bookshelf", tenant_id: tenantId, ...input } });
      if (error) {
        let detail = error.message;
        try { const result = await error.context?.json(); detail = result?.error || detail; } catch { /* use original message */ }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      return data as { id?: string; order_id?: string };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookshelf", tenantId] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  return { ...query, feature, operation };
}