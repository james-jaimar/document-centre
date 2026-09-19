import { supabase } from "@/integrations/supabase/client";
import { hasTenantSignOutFlag } from "@/lib/tenantSignOut";
import { rememberAnonymousUser } from "@/lib/auth/claimAnonymousWork";

/**
 * Single-flight guest (anonymous) sign-in.
 *
 * Several surfaces can mount at once (layout bootstrap, the /try entry point,
 * a second tab), and each `signInAnonymously()` call replaces the browser's
 * stored session. Concurrent calls therefore race and can leave the browser
 * holding a session that has already been rotated away — the SDK then discards
 * it and the visitor ends up with no session at all.
 *
 * This helper serialises sign-in:
 *  - within a tab, via a shared in-flight promise
 *  - across tabs, via a short localStorage lock
 * and always re-checks for an existing session inside the lock.
 */

const LOCK_KEY = "dc.guest_session.lock";
const LOCK_TTL_MS = 8000;
const POLL_MS = 150;
const MAX_WAIT_MS = 10000;

let inFlight: Promise<string | null> | null = null;

function now() {
  return Date.now();
}

function readLock(): number {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return 0;
    const ts = Number(raw);
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

function acquireLock(): boolean {
  try {
    const held = readLock();
    if (held && now() - held < LOCK_TTL_MS) return false;
    localStorage.setItem(LOCK_KEY, String(now()));
    return true;
  } catch {
    // Storage unavailable — fall back to the in-tab guard only.
    return true;
  }
}

function releaseLock() {
  try {
    localStorage.removeItem(LOCK_KEY);
  } catch {
    /* ignore */
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function createGuest(slug: string | null): Promise<string | null> {
  // Another tab may have signed in while we waited for the lock.
  const existing = await currentUserId();
  if (existing) return existing;

  const metadata: Record<string, unknown> = slug
    ? { tenant_slug: slug }
    : { is_demo: true, display_name: "Demo Visitor" };

  const { data, error } = await supabase.auth.signInAnonymously({ options: { data: metadata } });
  if (error) throw error;

  const id = data?.user?.id ?? null;
  if (id) rememberAnonymousUser(id, slug);
  return id;
}

/**
 * Ensure there is a signed-in visitor (real or guest) and return their id.
 * Returns null when a guest session must not be created — e.g. the customer
 * just signed out of this shop.
 */
export async function ensureGuestSession(
  slug: string | null,
  opts: { bootstrap?: boolean } = {},
): Promise<string | null> {
  const existing = await currentUserId();
  if (existing) return existing;

  if (slug && hasTenantSignOutFlag(slug)) return null;

  if (inFlight) return inFlight;

  inFlight = (async () => {
    // Cross-tab lock: wait for a peer sign-in rather than starting our own.
    const deadline = now() + MAX_WAIT_MS;
    while (!acquireLock()) {
      await sleep(POLL_MS);
      const id = await currentUserId();
      if (id) return id;
      if (now() > deadline) break;
    }

    try {
      const id = await createGuest(slug);
      if (id && opts.bootstrap !== false) {
        const fn = slug ? "tenant-bootstrap" : "demo-bootstrap";
        const body = slug ? { tenant_slug: slug } : undefined;
        await supabase.functions
          .invoke(fn, body ? { body } : {})
          .catch((e) => console.warn(`${fn} warning:`, e));
      }
      return id;
    } finally {
      releaseLock();
    }
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
