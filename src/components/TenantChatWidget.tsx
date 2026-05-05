import { useEffect, useRef } from "react";

const PLATFORM_TAWK_SRC = "https://embed.tawk.to/69f09c163aaa4c1c3adc10c6/1jn9u3enj";

interface TenantChatWidgetProps {
  isDemo: boolean;
  tawkEnabled: boolean;
  tawkPropertyId: string; // format: "propertyId/widgetId"
}

/**
 * Renders a Tawk.to chat widget scoped per tenant.
 *
 * - Demo tenants get the platform's own Tawk.to widget.
 * - Real tenants only get a widget if they've enabled it and provided their
 *   own Tawk.to property ID in admin settings.
 */
export default function TenantChatWidget({ isDemo, tawkEnabled, tawkPropertyId }: TenantChatWidgetProps) {
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  const src = isDemo
    ? PLATFORM_TAWK_SRC
    : tawkEnabled && tawkPropertyId
      ? `https://embed.tawk.to/${tawkPropertyId}`
      : null;

  useEffect(() => {
    if (!src) return;

    // Avoid double-injection of the same src
    if (scriptRef.current?.getAttribute("src") === src) return;

    // Clean up any previous widget
    cleanup();

    // @ts-expect-error - Tawk attaches to window
    window.Tawk_API = {};
    // @ts-expect-error - Tawk attaches to window
    window.Tawk_LoadStart = new Date();

    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    s.charset = "UTF-8";
    s.setAttribute("crossorigin", "*");
    document.head.appendChild(s);
    scriptRef.current = s;

    return () => cleanup();
  }, [src]);

  function cleanup() {
    if (scriptRef.current) {
      scriptRef.current.remove();
      scriptRef.current = null;
    }
    // Remove the Tawk iframe / widget container if present
    document.querySelectorAll("iframe[title='chat widget']").forEach((el) => el.remove());
    document.querySelectorAll("[id^='tawk-']").forEach((el) => el.remove());
    // @ts-expect-error - Tawk attaches to window
    delete window.Tawk_API;
    // @ts-expect-error - Tawk attaches to window
    delete window.Tawk_LoadStart;
  }

  return null;
}
