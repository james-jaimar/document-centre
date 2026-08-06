import { useEffect, useRef } from "react";
import { TURNSTILE_ENABLED, TURNSTILE_SITE_KEY, loadTurnstile } from "@/lib/turnstile";

/**
 * Invisible Cloudflare Turnstile widget for the public contact form.
 * Renders nothing when no site key is configured.
 *
 * If the script is blocked (CSP, ad-blocker, network) or the challenge errors,
 * `onUnavailable` fires so the form can degrade gracefully instead of dead-ending.
 */
export default function TurnstileWidget({
  onToken,
  onUnavailable,
  className,
}: {
  onToken: (token: string | null) => void;
  onUnavailable?: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const fail = useRef(onUnavailable);
  fail.current = onUnavailable;

  useEffect(() => {
    if (!TURNSTILE_ENABLED) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !ref.current) return;
        const ts = (window as any).turnstile;
        if (!ts) {
          fail.current?.();
          return;
        }
        widgetId.current = ts.render(ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "light",
          callback: (token: string) => cb.current(token),
          "expired-callback": () => cb.current(null),
          "error-callback": () => {
            cb.current(null);
            fail.current?.();
          },
        });
      })
      .catch(() => {
        cb.current(null);
        fail.current?.();
      });

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
