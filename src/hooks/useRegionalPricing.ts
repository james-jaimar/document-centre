import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useActiveBranchLocale } from "@/hooks/useBranchLocale";
import { PIVOT_CURRENCY } from "@/lib/pricing/convertCurrency";


const OVERRIDE_KEY = "dc_region_override";
const SESSION_COUNTRY_KEY = "dc_detected_country";

/**
 * Every component calling this hook keeps its own copy of the selected region,
 * so a switch in the header would otherwise leave every price on the page
 * showing the old currency. A tiny module-level broadcast keeps all live
 * instances in sync.
 */
const regionListeners = new Set<(code: string) => void>();
function broadcastRegion(code: string) {
  regionListeners.forEach((fn) => fn(code));
}

interface PricingRegion {
  id: string;
  region_code: string;
  region_label: string;
  currency_code: string;
  currency_symbol: string;
  country_codes: string[];
  tax_note: string | null;
  is_default: boolean;
  is_rest_of_world?: boolean;
  sort_order: number;
}

interface PricingPlan {
  id: string;
  plan_slug: string;
  plan_name: string;
  price: number;
  sort_order: number;
}

interface RegionalPricingResult {
  region: PricingRegion | null;
  regions: PricingRegion[];
  plans: PricingPlan[];
  loading: boolean;
  detected: boolean;
  /** True when the tenant sells in more than one currency (picker is live). */
  multiCurrency: boolean;
  /**
   * The currency rate cards are authored in — always the ZAR pivot. This is
   * NOT the tenant's default display currency (`displayDefaultCurrency`).
   */
  baseCurrency: string;
  /** The tenant's default *display* currency when no region is picked. */
  displayDefaultCurrency: string;
  setRegion: (regionCode: string) => void;
}

async function detectCountry(): Promise<string | null> {
  const cached = sessionStorage.getItem(SESSION_COUNTRY_KEY);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.functions.invoke("detect-region");
    if (error) return null;
    const code = (data?.country_code as string | null) ?? null;
    if (code) sessionStorage.setItem(SESSION_COUNTRY_KEY, code);
    return code;
  } catch {
    return null;
  }
}

function matchRegion(countryCode: string, regions: PricingRegion[]): PricingRegion | null {
  return regions.find((r) => r.country_codes.includes(countryCode)) || null;
}

export function useRegionalPricing(): RegionalPricingResult {
  const [regions, setRegions] = useState<PricingRegion[]>([]);
  const [region, setRegionState] = useState<PricingRegion | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [detected, setDetected] = useState(false);

  // Tenant currency policy.
  //  - lock_currency (default ON): ignore geo + manual override, force the
  //    tenant's default currency. This stops a UK visitor on a ZAR-only tenant
  //    getting GBP prices and a GBP stamp on their cart/order/invoice.
  //  - multi_currency_enabled: the tenant opts in to selling in several
  //    currencies. Geo detection and the header picker come alive, restricted
  //    to the currencies they accept.
  const { tenantId } = useTenantContext();
  const [tenantPolicy, setTenantPolicy] = useState<{
    currency: string;
    locked: boolean;
    multiCurrency: boolean;
    accepted: string[];
  } | null>(null);
  const [tenantLockLoaded, setTenantLockLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!tenantId) {
      setTenantPolicy(null);
      setTenantLockLoaded(true);
      return;
    }
    setTenantLockLoaded(false);
    (async () => {
      // Read through the SECURITY DEFINER RPC: storefront visitors (anonymous
      // or plain customers) have no SELECT rights on `tenant_settings`, so a
      // direct query silently returns nothing and the storefront gets stuck on
      // the fallback currency.
      const keys = [
        "default_currency_code",
        "lock_currency",
        "multi_currency_enabled",
        "accepted_currencies",
      ] as const;
      const results = await Promise.all(
        keys.map((key) =>
          supabase.rpc("resolve_tenant_setting", {
            p_tenant_id: tenantId,
            p_category: "financial",
            p_key: key,
          }),
        ),
      );
      if (cancelled) return;
      const map: Record<string, unknown> = {};
      keys.forEach((key, i) => {
        map[key] = results[i]?.data ?? null;
      });
      const currency = String(map.default_currency_code ?? "ZAR")
        .replace(/^"|"$/g, "")
        .toUpperCase();
      const multiCurrency = map.multi_currency_enabled === true;
      // Default: locked on for safety — tenants opt out explicitly. Turning on
      // multi-currency implies unlocked.
      const locked = multiCurrency
        ? false
        : map.lock_currency === undefined || map.lock_currency === null
          ? true
          : map.lock_currency === true;
      const acceptedRaw = Array.isArray(map.accepted_currencies)
        ? (map.accepted_currencies as unknown[])
        : [];
      const accepted = acceptedRaw.map((c) => String(c).toUpperCase());
      // The base currency is always sellable.
      if (multiCurrency && !accepted.includes(currency)) accepted.push(currency);
      setTenantPolicy({ currency, locked, multiCurrency, accepted });
      setTenantLockLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  // Fetch all regions once
  useEffect(() => {
    let cancelled = false;
    if (!tenantLockLoaded) return;

    async function load() {
      const { data: regionsData } = await supabase
        .from("platform_pricing_regions")
        .select("*")
        .order("sort_order");

      if (cancelled || !regionsData) return;

      const all = regionsData as PricingRegion[];
      // When the tenant opts into multi-currency, only the currencies they
      // accept are selectable. Otherwise the list is informational only.
      const accepted = tenantPolicy?.accepted ?? [];
      const selectable =
        tenantPolicy?.multiCurrency && accepted.length > 0
          ? all.filter((r) => accepted.includes((r.currency_code ?? "").toUpperCase()))
          : all;
      setRegions(selectable);

      const baseRegion =
        all.find(
          (r) => (r.currency_code ?? "").toUpperCase() === (tenantPolicy?.currency ?? "ZAR"),
        ) ?? null;
      const defaultRegion =
        baseRegion ?? selectable.find((r) => r.is_default) ?? all.find((r) => r.is_default) ?? all[0];

      // Single-currency tenant: forced to their default currency.
      if (!tenantPolicy?.multiCurrency && tenantPolicy?.locked) {
        setRegionState(defaultRegion);
        setDetected(false);
        setLoading(false);
        return;
      }

      // Check for manual override
      const override = localStorage.getItem(OVERRIDE_KEY);
      if (override) {
        const found = selectable.find((r) => r.region_code === override);
        if (found) {
          setRegionState(found);
          setDetected(false);
          setLoading(false);
          return;
        }
      }

      // Detect from IP (server-side via edge function)
      const countryCode = await detectCountry();
      if (cancelled) return;

      const matched = countryCode ? matchRegion(countryCode, selectable) : null;

      if (matched) {
        // Genuine, successful detection that mapped to a sellable region.
        setRegionState(matched);
        setDetected(true);
      } else if (tenantPolicy?.multiCurrency && countryCode) {
        // Detection worked but the country isn't covered by a specific region:
        // fall back to the rest-of-world region (USD) when the tenant sells it.
        const row = selectable.find((r) => r.is_rest_of_world) ?? defaultRegion;
        setRegionState(row);
        setDetected(!!selectable.find((r) => r.is_rest_of_world));
      } else {
        // Detection failed entirely — don't claim otherwise.
        setRegionState(defaultRegion);
        setDetected(false);
      }
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [
    tenantLockLoaded,
    tenantPolicy?.locked,
    tenantPolicy?.currency,
    tenantPolicy?.multiCurrency,
    tenantPolicy?.accepted?.join(","),
  ]);


  // Fetch plans when region changes
  useEffect(() => {
    if (!region) return;
    let cancelled = false;

    async function loadPlans() {
      const { data } = await supabase
        .from("platform_pricing_plans")
        .select("*")
        .eq("region_id", region.id)
        .order("sort_order");

      if (!cancelled && data) {
        setPlans(data as PricingPlan[]);
      }
    }

    loadPlans();
    return () => { cancelled = true; };
  }, [region?.id]);

  // Keep this instance in step with a switch made anywhere else on the page.
  useEffect(() => {
    const onChange = (code: string) => {
      setRegionState((prev) => {
        const found = regions.find((r) => r.region_code === code);
        return found ?? prev;
      });
      setDetected(false);
    };
    regionListeners.add(onChange);
    return () => { regionListeners.delete(onChange); };
  }, [regions]);

  const setRegion = useCallback(
    (regionCode: string) => {
      // When the tenant sells in one locked currency, switching is disabled.
      if (!tenantPolicy?.multiCurrency && tenantPolicy?.locked) return;
      const found = regions.find((r) => r.region_code === regionCode);
      if (found) {
        localStorage.setItem(OVERRIDE_KEY, regionCode);
        setRegionState(found);
        setDetected(false);
        broadcastRegion(regionCode);
      }
    },
    [regions, tenantPolicy?.locked, tenantPolicy?.multiCurrency]
  );

  return {
    region,
    regions,
    plans,
    loading,
    detected,
    multiCurrency: !!tenantPolicy?.multiCurrency && regions.length > 1,
    baseCurrency: PIVOT_CURRENCY,
    displayDefaultCurrency: tenantPolicy?.currency ?? PIVOT_CURRENCY,
    setRegion,
  };
}
