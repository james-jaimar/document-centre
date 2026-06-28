/**
 * Impersonation context — owns "Login as Customer" lifecycle.
 *
 * New-tab model:
 * - The staff tab never touches its own auth. `startImpersonation` calls the
 *   `impersonate-customer` edge function to mint a short-lived magiclink
 *   token, then opens `/impersonation/consume?...` in a NEW TAB.
 * - The consume route exchanges the token via `verifyOtp` and writes the
 *   active impersonation state into THAT tab's `sessionStorage`.
 * - The amber banner + 30-min idle timer therefore only run in the
 *   impersonation tab. Exit closes that tab.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const ACTIVE_KEY = "dc.impersonation.active";
const IDLE_MS = 30 * 60 * 1000;

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
    sessionStorage.removeItem(ACTIVE_KEY);
    setActive(null);

    if (current) {
      try {
        await supabase.functions.invoke("end-impersonation", {
          body: { impersonation_id: current.impersonation_id, reason },
        });
      } catch {
        /* audit best-effort */
      }
    }

    // Sign the customer session out of this tab, then close it.
    try { await supabase.auth.signOut(); } catch { /* noop */ }
    try {
      window.close();
    } catch { /* noop */ }
    // Fallback if the browser blocked window.close() (tab wasn't script-opened).
    setTimeout(() => {
      if (!window.closed) window.location.href = "/";
    }, 100);
  }, []);

  const startImpersonation = useCallback<Ctx["startImpersonation"]>(async (args) => {
    const { target_profile_id, tenant_id, branch_id, redirect_to } = args;
    const { data, error } = await supabase.functions.invoke("impersonate-customer", {
      body: { target_profile_id, tenant_id, branch_id },
    });
    if (error) throw error;
    const payload = data as any;
    if (!payload?.token_hash || !payload?.email) {
      throw new Error(payload?.error || "Invalid impersonation response");
    }

    const params = new URLSearchParams({
      token_hash: payload.token_hash,
      impersonation_id: payload.impersonation_id,
      expires_at: payload.expires_at,
      redirect: redirect_to,
      target: JSON.stringify(payload.target),
    });

    const url = `/impersonation/consume?${params.toString()}`;
    const win = window.open(url, "_blank", "noopener");
    if (!win) {
      throw new Error("Popup blocked — allow pop-ups for this site and try again.");
    }
  }, []);

  // Idle watcher (only meaningful in the impersonation tab where `active` is set).
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

/** True when the current browser tab is acting on behalf of a customer. */
export function useIsImpersonating(): boolean {
  return useImpersonation().active != null;
}

/** Internal helper used by the /impersonation/consume route to seed state. */
export const IMPERSONATION_ACTIVE_KEY = ACTIVE_KEY;
