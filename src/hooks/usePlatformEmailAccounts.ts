import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PlatformEmailAccount {
  id: string;
  tenant_id: string | null;
  branch_id: string | null;
  label: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  transport: "smtp" | "gmail_oauth" | "graph" | "graph_oauth";
  is_default: boolean;
  is_active: boolean;
  last_verified_at: string | null;
  last_error: string | null;
  oauth_email: string | null;
  created_at: string;
}

export function usePlatformEmailAccounts() {
  return useQuery({
    queryKey: ["platform_email_accounts"],
    queryFn: async (): Promise<PlatformEmailAccount[]> => {
      const { data, error } = await supabase
        .from("email_accounts")
        .select("*")
        .is("tenant_id", null)
        .is("branch_id", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlatformEmailAccount[];
    },
  });
}
