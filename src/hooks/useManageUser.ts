import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ManageUserAction =
  | "force_password_reset"
  | "disable_account"
  | "enable_account"
  | "delete_account"
  | "resend_invite"
  | "update_email"
  | "remove_membership"
  | "revoke_platform_admin";

export interface ManageUserInput {
  action: ManageUserAction;
  target_profile_id: string;
  tenant_id?: string | null;
  app_id?: string | null;
  membership_id?: string | null;
  new_email?: string;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-members"] });
      qc.invalidateQueries({ queryKey: ["platform-users"] });
    },
  });
}
