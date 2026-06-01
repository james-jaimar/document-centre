import { useEffect, useRef } from "react";

/**
 * Configures an additional GA4 property for a tenant storefront.
 *
 * When a tenant provides their own GA4 Measurement ID (e.g. G-POSTNET-XXX),
 * this hook calls `gtag('config', propertyId)` so that all subsequent GA
 * events are also sent to the tenant's own property.
 *
 * The platform's default property (G-12WFPWNXJX) remains active — events
 * are mirrored to both properties.
 */
export function useTenantGA(gaPropertyId: string | undefined | null) {
  const configuredRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const gtag = (window as any).gtag;
    if (typeof gtag !== "function") return;
    if (!gaPropertyId) return;
    if (configuredRef.current === gaPropertyId) return;

    gtag("config", gaPropertyId, {
      send_page_view: false, // we'll send page_views explicitly via useGAPageViews
    });
    configuredRef.current = gaPropertyId;
  }, [gaPropertyId]);
}
