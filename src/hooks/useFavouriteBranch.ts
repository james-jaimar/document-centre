import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Get/set the signed-in user's favourite_branch_id on their profile.
 * Storefronts will auto-select this branch when the user lands.
 */
export function useFavouriteBranch() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["favourite-branch", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("favourite_branch_id")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data?.favourite_branch_id as string | null) ?? null;
    },
  });

  const set = useMutation({
    mutationFn: async (branchId: string | null) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({ favourite_branch_id: branchId })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["favourite-branch"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Favourite branch updated");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update favourite branch"),
  });

  return { ...query, set };
}
