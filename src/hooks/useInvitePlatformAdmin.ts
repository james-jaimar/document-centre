import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InvitePlatformAdminInput {
  email: string;
  display_name?: string;
}

export function useInvitePlatformAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InvitePlatformAdminInput) => {
      const { data, error } = await supabase.functions.invoke("invite-platform-admin", {
        body: input,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-users"] });
    },
  });
}
