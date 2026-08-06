/**
 * Cloudflare Turnstile site key (publishable — safe in client code).
 *
 * Set `VITE_TURNSTILE_SITE_KEY` to enable the invisible captcha on the public
 * contact form. When it is absent the widget is skipped entirely and the form
 * still works, protected by the honeypot, timing trap, rate limits and spam
 * scoring in the `submit-contact` edge function.
 */
export const TURNSTILE_SITE_KEY: string =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ??
  "0x4AAAAAAEHsKgbhPAPt2ztL";


export const TURNSTILE_ENABLED = TURNSTILE_SITE_KEY.length > 0;

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loader: Promise<void> | null = null;

/** Loads the Turnstile script once, resolving when `window.turnstile` exists. */
export function loadTurnstile(): Promise<void> {
  if (!TURNSTILE_ENABLED) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    if ((window as any).turnstile) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="https://challenges.cloudflare.com/turnstile"]`,
    );
    const el = existing ?? document.createElement("script");
    el.addEventListener("load", () => resolve());
    el.addEventListener("error", () => reject(new Error("Turnstile failed to load")));
    if (!existing) {
      el.src = SCRIPT_SRC;
      el.async = true;
      el.defer = true;
      document.head.appendChild(el);
    }
  });
  return loader;
}
