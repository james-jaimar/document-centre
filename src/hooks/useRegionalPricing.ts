import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const OVERRIDE_KEY = "dc_region_override";
const SESSION_COUNTRY_KEY = "dc_detected_country";

interface PricingRegion {
  id: string;
  region_code: string;
  region_label: string;
  currency_code: string;
  currency_symbol: string;
  country_codes: string[];
  tax_note: string | null;
  is_default: boolean;
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
  setRegion: (regionCode: string) => void;
}

async function detectCountry(): Promise<string | null> {
  const cached = sessionStorage.getItem(SESSION_COUNTRY_KEY);
  if (cached) return cached;

  try {
    const res = await fetch("https://ip-api.com/json/?fields=countryCode", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const code = data.countryCode as string;
    if (code) sessionStorage.setItem(SESSION_COUNTRY_KEY, code);
    return code || null;
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

  // Fetch all regions once
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: regionsData } = await supabase
        .from("platform_pricing_regions")
        .select("*")
        .order("sort_order");

      if (cancelled || !regionsData) return;
      setRegions(regionsData as PricingRegion[]);

      const defaultRegion = regionsData.find((r: any) => r.is_default) || regionsData[0];

      // Check for manual override
      const override = localStorage.getItem(OVERRIDE_KEY);
      if (override) {
        const found = regionsData.find((r: any) => r.region_code === override);
        if (found) {
          setRegionState(found as PricingRegion);
          setDetected(false);
          setLoading(false);
          return;
        }
      }

      // Detect from IP
      const countryCode = await detectCountry();
      if (cancelled) return;

      if (countryCode) {
        const matched = matchRegion(countryCode, regionsData as PricingRegion[]);
        setRegionState(matched || (defaultRegion as PricingRegion));
        setDetected(true);
      } else {
        setRegionState(defaultRegion as PricingRegion);
        setDetected(true);
      }
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

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

  const setRegion = useCallback(
    (regionCode: string) => {
      const found = regions.find((r) => r.region_code === regionCode);
      if (found) {
        localStorage.setItem(OVERRIDE_KEY, regionCode);
        setRegionState(found);
        setDetected(false);
      }
    },
    [regions]
  );

  return { region, regions, plans, loading, detected, setRegion };
}
