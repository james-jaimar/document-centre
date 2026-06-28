import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DemoGateConfig {
  enabled: boolean;
  headline: string;
  disclaimer_html: string;
  cookie_days: number;
}

const storageKey = (tenantId: string) => `dc_demo_unlock_${tenantId}`;

export function getDemoUnlock(tenantId: string): boolean {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { expires_at: number };
    return parsed.expires_at > Date.now();
  } catch {
    return false;
  }
}

export function setDemoUnlock(tenantId: string, expires_at: number) {
  localStorage.setItem(storageKey(tenantId), JSON.stringify({ expires_at }));
}

export function useDemoGateConfig(tenantId: string | null) {
  return useQuery({
    queryKey: ["demo-gate-config", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<DemoGateConfig> => {
      const { data, error } = await supabase.rpc("resolve_demo_gate", {
        p_tenant_id: tenantId!,
      });
      if (error) throw error;
      const v = (data ?? {}) as Partial<DemoGateConfig>;
      return {
        enabled: !!v.enabled,
        headline: v.headline ?? "Concept Demo",
        disclaimer_html: v.disclaimer_html ?? "",
        cookie_days: v.cookie_days ?? 30,
      };
    },
    staleTime: 60_000,
  });
}

/** Reactive unlock state for one tenant. */
export function useDemoUnlock(tenantId: string | null) {
  const [unlocked, setUnlocked] = useState(() =>
    tenantId ? getDemoUnlock(tenantId) : false,
  );

  useEffect(() => {
    setUnlocked(tenantId ? getDemoUnlock(tenantId) : false);
  }, [tenantId]);

  const unlock = useCallback(
    (expires_at: number) => {
      if (!tenantId) return;
      setDemoUnlock(tenantId, expires_at);
      setUnlocked(true);
    },
    [tenantId],
  );

  return { unlocked, unlock };
}
