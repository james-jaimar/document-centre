/**
 * Build an auth URL that preserves the user's current location so they
 * land back on the same page after sign-in. `Auth.tsx` reads `?redirect=`.
 */
export function withAuthRedirect(authPath: string, location: { pathname: string; search: string; hash: string }): string {
  const target = `${location.pathname}${location.search}${location.hash}`;
  // Don't redirect back to the auth page itself.
  if (/\/auth(\/|$|\?)/.test(target)) return authPath;
  return `${authPath}?redirect=${encodeURIComponent(target)}`;
}
