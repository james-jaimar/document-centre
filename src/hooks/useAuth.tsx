import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoaded: boolean;
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
  // `loading` reflects ONLY the initial bootstrap. Background auth events
  // (e.g. TOKEN_REFRESHED) must never flip this back to true, otherwise the
  // route guards blank the entire app on tab refocus.
  const [loading, setLoading] = useState(true);
  // `rolesLoaded` flips false when the user identity changes and back to true
  // once that user's roles have been fetched. Consumers wait on this before
  // making routing decisions that depend on `highestRole`.
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const currentUserIdRef = useRef<string | null>(null);

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
      (event, nextSession) => {
        const nextUserId = nextSession?.user?.id ?? null;
        const prevUserId = currentUserIdRef.current;

        // Always keep session/user state in sync (cheap, same-identity updates
        // don't cause cascades because consumers should key off user?.id).
        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        // Only re-fetch roles when the actual user identity changes.
        if (nextUserId !== prevUserId) {
          currentUserIdRef.current = nextUserId;

          if (nextUserId) {
            setRolesLoaded(false);
            // Defer to avoid Supabase deadlock inside the listener
            setTimeout(async () => {
              const userRoles = await fetchRoles(nextUserId);
              // Guard against a newer identity change overtaking us.
              if (currentUserIdRef.current === nextUserId) {
                setRoles(userRoles);
                setRolesLoaded(true);
              }
            }, 0);
          } else {
            setRoles([]);
            setRolesLoaded(true);
          }
        }
        // TOKEN_REFRESHED, USER_UPDATED, etc. for the same user: do nothing
        // beyond syncing session — never flip `loading` back on.
      }
    );

    // THEN check existing session (initial bootstrap)
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      currentUserIdRef.current = initialSession?.user?.id ?? null;
      if (initialSession?.user) {
        const userRoles = await fetchRoles(initialSession.user.id);
        setRoles(userRoles);
      }
      setRolesLoaded(true);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRoles([]);
    setRolesLoaded(true);
    currentUserIdRef.current = null;
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
