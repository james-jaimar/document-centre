/**
 * Tenant-to-tenant trade partnerships ("supplier network").
 *
 * A supplier tenant invites a buyer tenant by one-time code, marks which of
 * its product families are offered wholesale, and the buyer links its own
 * products to the supplier's. Trade cost is read live from the supplier and
 * is never editable by the buyer.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { QuantityBlock } from "@/hooks/useProductFamilies";

export type SupplierLink = Tables<"supplier_links">;
export type SupplierOffering = Tables<"supplier_offerings">;
export type ProductSupplierAssignment = Tables<"product_supplier_assignments">;

export interface SupplierCatalogueItem {
  product_family_id: string;
  name: string;
  slug: string | null;
  lead_time_days: number | null;
  min_quantity: number | null;
  notes: string | null;
}

const LINKS_KEY = ["supplier_links"];
const OFFERINGS_KEY = ["supplier_offerings"];
const ASSIGNMENTS_KEY = ["product_supplier_assignments"];

/** Codes are short, unambiguous and uppercase — easy to read down the phone. */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/* ---------------------------------------------------------------- supplier */

/** Partnerships where this tenant is the supplier (people buying from us). */
export function useOutgoingSupplierLinks(supplierTenantId?: string | null) {
  return useQuery({
    queryKey: [...LINKS_KEY, "outgoing", supplierTenantId],
    enabled: !!supplierTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_links")
        .select("*, buyer:tenants!supplier_links_buyer_tenant_id_fkey(id,name,slug), company:customer_companies(id,name)")
        .eq("supplier_tenant_id", supplierTenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (SupplierLink & {
        buyer: { id: string; name: string; slug: string | null } | null;
        company: { id: string; name: string } | null;
      })[];
    },
  });
}

export function useCreateSupplierInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      supplier_tenant_id: string;
      buyer_company_id?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("supplier_links")
        .insert({
          supplier_tenant_id: input.supplier_tenant_id,
          buyer_company_id: input.buyer_company_id ?? null,
          notes: input.notes ?? null,
          invite_code: generateInviteCode(),
          status: "invited",
        })
        .select()
        .single();
      if (error) throw error;
      return data as SupplierLink;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LINKS_KEY }),
  });
}

export function useRevokeSupplierLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("supplier_links")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LINKS_KEY }),
  });
}

/** Our own wholesale catalogue (what we offer to trade partners). */
export function useSupplierOfferings(supplierTenantId?: string | null) {
  return useQuery({
    queryKey: [...OFFERINGS_KEY, supplierTenantId],
    enabled: !!supplierTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_offerings")
        .select("*")
        .eq("supplier_tenant_id", supplierTenantId!);
      if (error) throw error;
      return (data ?? []) as SupplierOffering[];
    },
  });
}

export function useUpsertSupplierOffering() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      supplier_tenant_id: string;
      product_family_id: string;
      is_offered: boolean;
      lead_time_days?: number | null;
      min_quantity?: number | null;
      notes?: string | null;
    }) => {
      const { error } = await supabase
        .from("supplier_offerings")
        .upsert(input, { onConflict: "supplier_tenant_id,product_family_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: OFFERINGS_KEY }),
  });
}

/* ------------------------------------------------------------------- buyer */

/** Partnerships where this tenant is the buyer (our suppliers). */
export function useIncomingSupplierLinks(buyerTenantId?: string | null) {
  return useQuery({
    queryKey: [...LINKS_KEY, "incoming", buyerTenantId],
    enabled: !!buyerTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_links")
        .select("*, supplier:tenants!supplier_links_supplier_tenant_id_fkey(id,name,slug)")
        .eq("buyer_tenant_id", buyerTenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (SupplierLink & {
        supplier: { id: string; name: string; slug: string | null } | null;
      })[];
    },
  });
}

export function useAcceptSupplierInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, buyerTenantId }: { code: string; buyerTenantId: string }) => {
      const { data, error } = await supabase.rpc("accept_supplier_invite", {
        p_code: code,
        p_buyer_tenant_id: buyerTenantId,
      });
      if (error) throw error;
      return data as unknown as SupplierLink;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LINKS_KEY }),
  });
}

/** Products a partner has offered us. */
export function useSupplierCatalogue(linkId?: string | null) {
  return useQuery({
    queryKey: ["supplier_catalogue", linkId],
    enabled: !!linkId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("supplier_catalogue", { p_link_id: linkId! });
      if (error) throw error;
      return (data ?? []) as SupplierCatalogueItem[];
    },
  });
}

/** The partner's locked trade ladder for one of their products. */
export function useSupplierTradeBlocks(linkId?: string | null, supplierFamilyId?: string | null) {
  return useQuery({
    queryKey: ["supplier_trade_blocks", linkId, supplierFamilyId],
    enabled: !!linkId && !!supplierFamilyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("supplier_trade_blocks", {
        p_link_id: linkId!,
        p_supplier_family_id: supplierFamilyId!,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as QuantityBlock[];
    },
  });
}

export function useProductSupplierAssignments(tenantId?: string | null) {
  return useQuery({
    queryKey: [...ASSIGNMENTS_KEY, tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_supplier_assignments")
        .select("*")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as ProductSupplierAssignment[];
    },
  });
}

export function useUpsertProductSupplierAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      tenant_id: string;
      product_family_id: string;
      supplier_link_id: string;
      supplier_product_family_id: string;
      is_active?: boolean;
    }) => {
      const { error } = await supabase
        .from("product_supplier_assignments")
        .upsert({ is_active: true, ...input }, { onConflict: "tenant_id,product_family_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSIGNMENTS_KEY }),
  });
}

export function useDeleteProductSupplierAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tenantId, productFamilyId }: { tenantId: string; productFamilyId: string }) => {
      const { error } = await supabase
        .from("product_supplier_assignments")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("product_family_id", productFamilyId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSIGNMENTS_KEY }),
  });
}
