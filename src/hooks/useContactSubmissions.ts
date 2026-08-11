import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EnquiryStatus = "new" | "read" | "replied" | "spam";

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  subject: string | null;
  message: string;
  source: string | null;
  user_agent: string | null;
  ip_address: string | null;
  status: string;
  spam_score: number | null;
  spam_reasons: string[] | null;
  notes: string | null;
  created_at: string;
  handled_at: string | null;
}

/** Platform-admin only: RLS restricts both read and update to platform_admin. */
export function useContactSubmissions(status: EnquiryStatus | "all") {
  return useQuery({
    queryKey: ["contact-submissions", status],
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("contact_submissions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ContactSubmission[];
    },
  });
}

export function useNewEnquiriesCount(enabled: boolean) {
  const query = useQuery({
    queryKey: ["contact-submissions-new-count"],
    enabled,
    staleTime: 30_000,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("contact_submissions")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      if (error) throw error;
      return count ?? 0;
    },
  });
  return query.data ?? 0;
}

export function useUpdateEnquiryStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: EnquiryStatus }) => {
      const { error } = await supabase
        .from("contact_submissions")
        .update({
          status,
          handled_at: status === "new" ? null : new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-submissions"] });
      qc.invalidateQueries({ queryKey: ["contact-submissions-new-count"] });
    },
  });
}
