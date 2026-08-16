import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import {
  formatLength,
  formatSize,
  formatSizeWithName,
  resolveUnitSystem,
  term,
  type UnitPreference,
  type UnitSystem,
} from "@/lib/units";

const OVERRIDE_KEY = "dc_unit_override";

/** Keep every live instance in sync when the unit is switched. */
const listeners = new Set<(u: UnitPreference | null) => void>();
function broadcast(pref: UnitPreference | null) {
  listeners.forEach((fn) => fn(pref));
}

export interface MeasurementUnitResult {
  unit: UnitSystem;
  /** Tenant setting as stored: `auto` | `metric` | `imperial`. */
  preference: UnitPreference;
  loading: boolean;
  /** Manual (per-visitor) override, if any. */
  setOverride: (pref: UnitPreference | null) => void;
  fmtSize: (widthMm: number, heightMm: number) => string;
  fmtSizeWithName: (name: string | null | undefined, widthMm: number, heightMm: number) => string;
  fmtLength: (mm: number) => string;
  t: (text: string) => string;
}

/**
 * Resolution order: visitor override → tenant `regional.measurement_unit`
 * setting → storefront pricing region (US/CA ⇒ imperial) → metric.
 */
export function useMeasurementUnit(): MeasurementUnitResult {
  const { tenantId } = useTenantContext();
  const { region, loading: regionLoading } = useRegionalPricing();
  const [preference, setPreference] = useState<UnitPreference>("auto");
  const [loading, setLoading] = useState(true);
  const [override, setOverrideState] = useState<UnitPreference | null>(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(OVERRIDE_KEY) : null;
    return v === "metric" || v === "imperial" ? v : null;
  });

  useEffect(() => {
    const fn = (pref: UnitPreference | null) => setOverrideState(pref);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!tenantId) {
      setPreference("auto");
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      // SECURITY DEFINER RPC — anonymous storefront visitors cannot read
      // tenant_settings directly.
      const { data } = await supabase.rpc("resolve_tenant_setting", {
        p_tenant_id: tenantId,
        p_category: "regional",
        p_key: "measurement_unit",
      });
      if (cancelled) return;
      const raw = String(data ?? "auto").replace(/^"|"$/g, "").toLowerCase();
      setPreference(raw === "metric" || raw === "imperial" ? (raw as UnitPreference) : "auto");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const unit = useMemo<UnitSystem>(() => {
    if (override) return resolveUnitSystem(override, region?.region_code);
    return resolveUnitSystem(preference, region?.region_code);
  }, [override, preference, region?.region_code]);

  const setOverride = useCallback((pref: UnitPreference | null) => {
    if (pref === "metric" || pref === "imperial") {
      localStorage.setItem(OVERRIDE_KEY, pref);
    } else {
      localStorage.removeItem(OVERRIDE_KEY);
    }
    setOverrideState(pref && pref !== "auto" ? pref : null);
    broadcast(pref);
  }, []);

  return {
    unit,
    preference,
    loading: loading || regionLoading,
    setOverride,
    fmtSize: useCallback((w: number, h: number) => formatSize(w, h, unit), [unit]),
    fmtSizeWithName: useCallback(
      (name: string | null | undefined, w: number, h: number) => formatSizeWithName(name, w, h, unit),
      [unit],
    ),
    fmtLength: useCallback((mm: number) => formatLength(mm, unit), [unit]),
    t: useCallback((text: string) => term(text, unit), [unit]),
  };
}
