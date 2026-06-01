import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Sends a GA4 `page_view` event on every SPA route change.
 *
 * The platform GA property (G-12WFPWNXJX) is already configured in
 * index.html; this hook simply emits the `page_view` event with the
 * current URL so that GA4 records the new route in a single-page app.
 */
export function useGAPageViews() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const gtag = (window as any).gtag;
    if (typeof gtag !== "function") return;

    const pagePath = location.pathname + location.search;
    const pageLocation = window.location.href;
    const pageTitle = document.title;

    gtag("event", "page_view", {
      page_path: pagePath,
      page_location: pageLocation,
      page_title: pageTitle,
    });
  }, [location.pathname, location.search]);
}
