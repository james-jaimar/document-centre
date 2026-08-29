/**
 * Remembers where a user was when they started an OAuth sign-in so we can put
 * them back there afterwards (e.g. the cart / checkout).
 *
 * Two belts:
 *  1. `next` query param on the OAuth callback URL (survives storage quirks).
 *  2. A timestamped localStorage entry, used as a fallback when the provider
 *     drops us on the site root instead of /auth/callback.
 */

const KEY = "dc_return_path";
const AT_KEY = "dc_return_path_at";
const MAX_AGE_MS = 10 * 60 * 1000;

export function rememberReturnPath(path?: string) {
  const target = path ?? window.location.pathname + window.location.search;
  try {
    localStorage.setItem(KEY, target);
    localStorage.setItem(AT_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — the `next` param still covers us */
  }
}

/** Reads (and clears) the stored return path if it is still fresh. */
export function takeReturnPath(): string | null {
  try {
    const path = localStorage.getItem(KEY);
    const at = Number(localStorage.getItem(AT_KEY) ?? 0);
    clearReturnPath();
    if (!path || !path.startsWith("/")) return null;
    if (at && Date.now() - at > MAX_AGE_MS) return null;
    return path;
  } catch {
    return null;
  }
}

/** Reads the stored return path without clearing it. */
export function peekReturnPath(): string | null {
  try {
    const path = localStorage.getItem(KEY);
    const at = Number(localStorage.getItem(AT_KEY) ?? 0);
    if (!path || !path.startsWith("/")) return null;
    if (at && Date.now() - at > MAX_AGE_MS) return null;
    return path;
  } catch {
    return null;
  }
}

export function clearReturnPath() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(AT_KEY);
  } catch {
    /* noop */
  }
}

/** Only same-origin app paths are ever honoured. */
export function isSafeReturnPath(path: string | null | undefined): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//") && !/\/auth(\/|$|\?)/.test(path);
}
