import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type ManageUserAction =
  | "force_password_reset"
  | "disable_account"
  | "enable_account"
  | "delete_account"
  | "resend_invite"
  | "update_email"
  | "update_profile"
  | "remove_membership"
  | "revoke_platform_admin";

export interface ManageUserInput {
  action: ManageUserAction;
  target_profile_id: string;
  tenant_id?: string | null;
  app_id?: string | null;
  membership_id?: string | null;
  new_email?: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  reason?: string;
}

export function useManageUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManageUserInput) => {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: input,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["tenant-members"] });
      qc.invalidateQueries({ queryKey: ["platform-users"] });
      toast.success(data?.message ?? "Done");
    },
    onError: (error: Error) => {
      toast.error(error.message ?? "Action failed");
    },
  });
}
