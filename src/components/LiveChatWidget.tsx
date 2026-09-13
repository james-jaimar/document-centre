import { useEffect, useRef } from "react";

interface LiveChatWidgetProps {
  /** Fully resolved Tawk embed URL, or null when chat is off. */
  src: string | null;
}

/**
 * Injects the Tawk.to widget for a resolved embed URL.
 *
 * Only ever mounted on customer-facing surfaces — never on auth/login,
 * admin, platform or branch back-office pages (a third-party chat widget on
 * a login page is a known phishing heuristic for Google Safe Browsing).
 */
export default function LiveChatWidget({ src }: LiveChatWidgetProps) {
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    if (!src) {
      cleanup();
      return;
    }
    if (scriptRef.current?.getAttribute("src") === src) return;

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
    document.querySelectorAll("iframe[title='chat widget']").forEach((el) => el.remove());
    document.querySelectorAll("[id^='tawk-']").forEach((el) => el.remove());
    // @ts-expect-error - Tawk attaches to window
    delete window.Tawk_API;
    // @ts-expect-error - Tawk attaches to window
    delete window.Tawk_LoadStart;
  }

  return null;
}
