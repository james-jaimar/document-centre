/**
 * Impersonation context — owns "Login as Customer" lifecycle.
 *
 * Storage model:
 * - sessionStorage["dc.impersonation.staff_session"]  -> stashed Supabase auth row
 *                                                       (the localStorage value of the
 *                                                       sb-<ref>-auth-token key) so we can
 *                                                       restore the staff session on exit.
 * - sessionStorage["dc.impersonation.active"]         -> JSON { impersonation_id, target,
 *                                                       expires_at, return_to } describing
 *                                                       the active session.
 *
 * Idle behaviour: 30 minutes of no pointer/key activity ends the session and
 * restores the staff identity.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STAFF_SESSION_KEY = "dc.impersonation.staff_session";
const ACTIVE_KEY = "dc.impersonation.active";
const IDLE_MS = 30 * 60 * 1000;

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const SUPABASE_STORAGE_KEY = `sb-${SUPABASE_PROJECT_ID}-auth-token`;

export interface ImpersonationTarget {
  profile_id: string;
  email: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface ImpersonationState {
  impersonation_id: string;
  target: ImpersonationTarget;
  expires_at: string;
  return_to: string;
}

interface Ctx {
  active: ImpersonationState | null;
  startImpersonation: (args: {
    target_profile_id: string;
    tenant_id?: string | null;
    branch_id?: string | null;
    return_to?: string;
    redirect_to: string;
  }) => Promise<void>;
  endImpersonation: (reason?: string) => Promise<void>;
}

const ImpersonationContext = createContext<Ctx | null>(null);

function readActive(): ImpersonationState | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ImpersonationState;
  } catch {
    return null;
  }
}

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ImpersonationState | null>(() =>
    typeof window !== "undefined" ? readActive() : null,
  );
  const idleTimer = useRef<number | null>(null);

  const endImpersonation = useCallback(async (reason: string = "user_exit") => {
    const current = readActive();
    if (!current) {
      setActive(null);
      return;
    }
    // Fire-and-forget audit close.
    try {
      await supabase.functions.invoke("end-impersonation", {
        body: { impersonation_id: current.impersonation_id, reason },
      });
    } catch {
      /* swallow — audit best-effort */
    }
    // Restore stashed staff session into localStorage *before* signing out, so
    // the next page load picks it up.
    const stash = sessionStorage.getItem(STAFF_SESSION_KEY);
    sessionStorage.removeItem(STAFF_SESSION_KEY);
    sessionStorage.removeItem(ACTIVE_KEY);

    if (stash) {
      try {
        const parsed = JSON.parse(stash);
        // The stash is a Supabase session payload (currentSession + extras).
        const sess = parsed?.currentSession ?? parsed;
        if (sess?.access_token && sess?.refresh_token) {
          await supabase.auth.setSession({
            access_token: sess.access_token,
            refresh_token: sess.refresh_token,
          });
        } else {
          localStorage.setItem(SUPABASE_STORAGE_KEY, stash);
        }
      } catch {
        try {
          localStorage.setItem(SUPABASE_STORAGE_KEY, stash);
        } catch { /* noop */ }
      }
    } else {
      await supabase.auth.signOut();
    }

    setActive(null);
    // Send the staff back to where they came from.
    window.location.href = current.return_to || "/";
  }, []);

  const startImpersonation = useCallback<Ctx["startImpersonation"]>(async (args) => {
    const { target_profile_id, tenant_id, branch_id, return_to, redirect_to } = args;
    const { data, error } = await supabase.functions.invoke("impersonate-customer", {
      body: { target_profile_id, tenant_id, branch_id },
    });
    if (error) throw error;
    const payload = data as any;
    if (!payload?.token_hash || !payload?.email) throw new Error("Invalid impersonation response");

    // Stash the staff session *before* swapping.
    const currentStash = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (currentStash) sessionStorage.setItem(STAFF_SESSION_KEY, currentStash);

    // Exchange the magiclink token for a real customer session in this browser.
    const { error: vErr } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: payload.token_hash,
      email: payload.email,
    } as any);
    if (vErr) {
      // Restore stash, the swap failed.
      sessionStorage.removeItem(STAFF_SESSION_KEY);
      throw vErr;
    }

    const state: ImpersonationState = {
      impersonation_id: payload.impersonation_id,
      target: payload.target,
      expires_at: payload.expires_at,
      return_to: return_to || window.location.pathname + window.location.search,
    };
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(state));
    setActive(state);

    // Land the staff member on the customer portal.
    window.location.href = redirect_to;
  }, []);

  // Idle watcher.
  useEffect(() => {
    if (!active) return;
    const reset = () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        endImpersonation("idle_timeout");
      }, IDLE_MS);
    };
    reset();
    const evs = ["mousemove", "keydown", "click", "touchstart"];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [active, endImpersonation]);

  // Hard expiry guard.
  useEffect(() => {
    if (!active) return;
    const expiresMs = new Date(active.expires_at).getTime() - Date.now();
    if (expiresMs <= 0) {
      endImpersonation("expired");
      return;
    }
    const t = window.setTimeout(() => endImpersonation("expired"), expiresMs);
    return () => window.clearTimeout(t);
  }, [active, endImpersonation]);

  const value = useMemo<Ctx>(
    () => ({ active, startImpersonation, endImpersonation }),
    [active, startImpersonation, endImpersonation],
  );

  return <ImpersonationContext.Provider value={value}>{children}</ImpersonationContext.Provider>;
}

export function useImpersonation(): Ctx {
  const ctx = useContext(ImpersonationContext);
  if (!ctx) throw new Error("useImpersonation must be used inside ImpersonationProvider");
  return ctx;
}

/** True when the current browser session is acting on behalf of a customer. */
export function useIsImpersonating(): boolean {
  return useImpersonation().active != null;
}
