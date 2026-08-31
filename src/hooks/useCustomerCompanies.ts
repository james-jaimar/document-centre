/**
 * Business (company) records for customers.
 *
 * A company holds the full business profile — company name, VAT, registered
 * details, billing/delivery address and account terms — and can have many
 * customer users linked to it through `tenant_memberships.company_id`.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type CustomerCompany = Tables<"customer_companies">;
export type CustomerCompanyInput = Omit<
  TablesInsert<"customer_companies">,
  "tenant_id" | "app_id" | "id" | "created_at" | "updated_at" | "created_by"
>;

export interface CompanyMember {
  membership_id: string;
  profile_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  phone: string | null;
  job_title: string | null;
  is_primary_contact: boolean;
  is_active: boolean;
}

const LIST_KEY = "customer-companies";

export function useCustomerCompanies(opts?: { branchId?: string | null }) {
  const { tenantId, appId } = useTenantContext();
  const branchId = opts?.branchId ?? null;
  return useQuery({
    queryKey: [LIST_KEY, tenantId, appId, branchId],
    enabled: !!tenantId && !!appId,
    queryFn: async () => {
      let q = supabase
        .from("customer_companies")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("app_id", appId!)
        .order("name");
      if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CustomerCompany[];
    },
  });
}

export function useCustomerCompany(id: string | undefined) {
  return useQuery({
    queryKey: [LIST_KEY, "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_companies")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CustomerCompany | null;
    },
  });
}

export function useSaveCustomerCompany() {
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomerCompanyInput & { id?: string }) => {
      if (!tenantId || !appId) throw new Error("Missing tenant context");
      const { id, ...rest } = input;
      if (id) {
        const { data, error } = await supabase
          .from("customer_companies")
          .update(rest)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw error;
        return data as CustomerCompany;
      }
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("customer_companies")
        .insert({
          ...rest,
          tenant_id: tenantId,
          app_id: appId,
          created_by: auth.user?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as CustomerCompany;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
      qc.invalidateQueries({ queryKey: [LIST_KEY, "one", row.id] });
      toast.success("Company saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save company"),
  });
}

export function useDeleteCustomerCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [LIST_KEY] });
      toast.success("Company deleted");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete company"),
  });
}

export function useCompanyMembers(companyId: string | undefined) {
  return useQuery({
    queryKey: [LIST_KEY, "members", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // NOTE: no declared FK between tenant_memberships.profile_id and
      // profiles, so a PostgREST embed 400s. Fetch in two steps and merge.
      const { data: rows, error } = await supabase
        .from("tenant_memberships")
        .select("id, profile_id, job_title, is_primary_contact, is_active")
        .eq("company_id", companyId!);
      if (error) throw error;
      if (!rows?.length) return [] as CompanyMember[];

      const ids = [...new Set(rows.map((m) => m.profile_id))];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name, display_name, phone")
        .in("id", ids);
      if (pErr) throw pErr;

      return rows.map((m: any): CompanyMember => {
        const p: any = profiles?.find((pr) => pr.id === m.profile_id) ?? null;
        return {
          membership_id: m.id,
          profile_id: m.profile_id,
          email: p?.email ?? null,
          first_name: p?.first_name ?? null,
          last_name: p?.last_name ?? null,
          display_name: p?.display_name ?? null,
          phone: p?.phone ?? null,
          job_title: m.job_title ?? null,
          is_primary_contact: !!m.is_primary_contact,
          is_active: m.is_active !== false,
        };
      });
    },
  });
}

/** Customers in this tenant that are not yet attached to any company. */
export function useUnlinkedCustomers() {
  const { tenantId, appId } = useTenantContext();
  return useQuery({
    queryKey: [LIST_KEY, "unlinked", tenantId, appId],
    enabled: !!tenantId && !!appId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("tenant_memberships")
        .select("id, profile_id")
        .eq("tenant_id", tenantId!)
        .eq("app_id", appId!)
        .eq("role", "customer")
        .is("company_id", null);
      if (error) throw error;
      if (!rows?.length) return [];

      const ids = [...new Set(rows.map((m) => m.profile_id))];
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name, display_name, is_anonymous")
        .in("id", ids);
      if (pErr) throw pErr;

      return rows
        .map((m: any) => ({ m, p: profiles?.find((pr: any) => pr.id === m.profile_id) as any }))
        .filter(({ p }) => p?.email && !p?.is_anonymous)
        .map(({ m, p }) => ({
          membership_id: m.id as string,
          profile_id: m.profile_id as string,
          email: p.email as string,
          name:
            p.display_name ||
            [p.first_name, p.last_name].filter(Boolean).join(" ") ||
            p.email,
        }));
    },
  });
}


export function useCompanyMemberMutations(companyId: string | undefined) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [LIST_KEY, "members", companyId] });
    qc.invalidateQueries({ queryKey: [LIST_KEY, "unlinked"] });
    qc.invalidateQueries({ queryKey: ["tenantCustomers"] });
    qc.invalidateQueries({ queryKey: ["branchCustomers"] });
  };

  const link = useMutation({
    mutationFn: async (membershipId: string) => {
      if (!companyId) throw new Error("Missing company");
      const { error } = await supabase
        .from("tenant_memberships")
        .update({ company_id: companyId })
        .eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("User linked to company"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to link user"),
  });

  const unlink = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase
        .from("tenant_memberships")
        .update({ company_id: null, is_primary_contact: false })
        .eq("id", membershipId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("User removed from company"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove user"),
  });

  const update = useMutation({
    mutationFn: async (input: {
      membershipId: string;
      job_title?: string | null;
      is_primary_contact?: boolean;
    }) => {
      if (input.is_primary_contact && companyId) {
        const { error: clearErr } = await supabase
          .from("tenant_memberships")
          .update({ is_primary_contact: false })
          .eq("company_id", companyId);
        if (clearErr) throw clearErr;
      }
      const patch: { job_title?: string | null; is_primary_contact?: boolean } = {};
      if (input.job_title !== undefined) patch.job_title = input.job_title;
      if (input.is_primary_contact !== undefined) patch.is_primary_contact = input.is_primary_contact;
      const { error } = await supabase
        .from("tenant_memberships")
        .update(patch)
        .eq("id", input.membershipId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Failed to update member"),
  });

  return { link, unlink, update };
}
