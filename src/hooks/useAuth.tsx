import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  highestRole: AppRole | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ROLE_PRIORITY: AppRole[] = [
  "platform_admin",
  "head_office_admin",
  "branch_manager",
  "store_operator",
  "customer",
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) {
      console.error("Error fetching roles:", error);
      return [];
    }
    return (data || []).map((r) => r.role);
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Mark loading so consumers wait for roles before redirecting
          setLoading(true);
          // Defer role fetch to avoid Supabase deadlock
          setTimeout(async () => {
            const userRoles = await fetchRoles(session.user.id);
            setRoles(userRoles);
            setLoading(false);
          }, 0);
        } else {
          setRoles([]);
          setLoading(false);
        }
      }
    );

    // THEN check existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const userRoles = await fetchRoles(session.user.id);
        setRoles(userRoles);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRoles([]);
  }, []);

  const hasRole = useCallback(
    (role: AppRole) => roles.includes(role),
    [roles]
  );

  const highestRole = roles.length
    ? ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null
    : null;

  return (
    <AuthContext.Provider
      value={{ user, session, roles, loading, signOut, hasRole, highestRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/** Returns the default landing route for a given role */
export function getDefaultRoute(role: AppRole | null): string {
  switch (role) {
    case "platform_admin":
      return "/platform";
    case "head_office_admin":
      return "/admin";
    case "branch_manager":
    case "store_operator":
      return "/branch";
    case "customer":
    default:
      return "/dashboard";
  }
}
