import { useEffect } from "react";

/**
 * Tawk.to chat widget.
 *
 * Mount only on marketing/customer-shop surfaces — NEVER on auth/login,
 * admin, platform, or branch pages. A third-party chat widget loaded on a
 * login page is a known phishing-heuristic trigger for Google Safe Browsing.
 */
const TAWK_SRC = "https://embed.tawk.to/69f09c163aaa4c1c3adc10c6/1jn9u3enj";

let injected = false;

export default function ChatWidget() {
  useEffect(() => {
    if (injected) return;
    if (typeof document === "undefined") return;

    // Initialise globals expected by the Tawk embed.
    // @ts-expect-error - Tawk attaches to window
    window.Tawk_API = window.Tawk_API || {};
    // @ts-expect-error - Tawk attaches to window
    window.Tawk_LoadStart = new Date();

    const s = document.createElement("script");
    s.async = true;
    s.src = TAWK_SRC;
    s.charset = "UTF-8";
    s.setAttribute("crossorigin", "*");
    document.head.appendChild(s);
    injected = true;
  }, []);

  return null;
}
