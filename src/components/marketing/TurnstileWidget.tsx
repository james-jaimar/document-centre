import { useEffect, useRef } from "react";
import { TURNSTILE_ENABLED, TURNSTILE_SITE_KEY, loadTurnstile } from "@/lib/turnstile";

/**
 * Invisible Cloudflare Turnstile widget for the public contact form.
 * Renders nothing when no site key is configured.
 */
export default function TurnstileWidget({
  onToken,
  className,
}: {
  onToken: (token: string | null) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_ENABLED) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !ref.current) return;
        const ts = (window as any).turnstile;
        if (!ts) return;
        widgetId.current = ts.render(ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "light",
          callback: (token: string) => cb.current(token),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));

    return () => {
      cancelled = true;
      const ts = (window as any).turnstile;
      if (ts && widgetId.current) {
        try {
          ts.remove(widgetId.current);
        } catch {
          /* widget already gone */
        }
      }
    };
  }, []);

  if (!TURNSTILE_ENABLED) return null;
  return <div ref={ref} className={className} />;
}
