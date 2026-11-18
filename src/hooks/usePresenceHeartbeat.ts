import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantContext as useTenant } from "@/hooks/useTenantContext";

const INTERVAL_MS = 60_000;

/** Pings presence_heartbeat while a signed-in (non-guest) user has the tab open. */
export function usePresenceHeartbeat() {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { pathname } = useLocation();
  const latest = useRef({ tenantId, pathname });
  latest.current = { tenantId, pathname };

  const isReal = !!user && !(user as { is_anonymous?: boolean }).is_anonymous;

  useEffect(() => {
    if (!isReal) return;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      supabase
        .rpc("presence_heartbeat" as never, {
          _tenant_id: latest.current.tenantId,
          _path: latest.current.pathname,
          _user_agent: navigator.userAgent,
        } as never)
        .then(() => undefined, () => undefined);
    };
    beat();
    const id = window.setInterval(beat, INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [isReal, user?.id]);

  // Extra ping on page / tenant change
  useEffect(() => {
    if (!isReal) return;
    supabase
      .rpc("presence_heartbeat" as never, { _tenant_id: tenantId, _path: pathname, _user_agent: navigator.userAgent } as never)
      .then(() => undefined, () => undefined);
  }, [isReal, pathname, tenantId]);
}

export function PresenceHeartbeat() {
  usePresenceHeartbeat();
  return null;
}
