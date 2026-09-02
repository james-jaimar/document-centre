import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

const EXEMPT = /(reset-password|auth|welcome|impersonation|activate)/;

/**
 * Customers who were sent a welcome email must choose their own password
 * before they can use the portal. Redirects them to the reset-password screen
 * until `profiles.must_change_password` is cleared.
 */
export function useForcePasswordChange(user: User | null | undefined, basePath: string) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const isAnon = !!(user as any)?.is_anonymous;
  const userId = !user || isAnon ? null : user.id;

  const { data: mustChange } = useQuery({
    queryKey: ["must-change-password", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", userId!)
        .maybeSingle();
      if (error) return false;
      return !!data?.must_change_password;
    },
  });

  useEffect(() => {
    if (!mustChange) return;
    if (EXEMPT.test(pathname)) return;
    const target = `${basePath.replace(/\/$/, "")}/reset-password`;
    navigate(target, { replace: true, state: { from: pathname + search } });
  }, [mustChange, pathname, search, basePath, navigate]);
}
