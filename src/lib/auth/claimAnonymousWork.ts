import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateUserOrderCaches } from "@/lib/queryInvalidation";

/**
 * Anonymous-to-authenticated hand-off.
 *
 * The storefront creates an anonymous Supabase user so guests can build a
 * cart. When they later sign in (by any route — checkout box, storefront
 * sign-in page, or Google OAuth) the anonymous user's carts/drafts must be
 * transferred to the real account, otherwise the work silently disappears.
 *
 * The anonymous id is recorded as soon as the anonymous session exists, NOT
 * at the moment a sign-in button is clicked, so it survives every sign-out /
 * session-replacement path. It is only cleared after a successful claim, so a
 * transient failure retries on the next sign-in rather than dropping the cart.
 */
const KEY = "dc_anon_user_id";
const META_KEY = "dc_anon_user_meta";

export function rememberAnonymousUser(userId: string, tenantSlug?: string | null) {
  if (!userId) return;
  try {
    localStorage.setItem(KEY, userId);
    localStorage.setItem(
      META_KEY,
      JSON.stringify({ tenant_slug: tenantSlug ?? null, at: Date.now() }),
    );
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function peekAnonymousUser(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearAnonymousUser() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(META_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Transfer any anonymous carts/drafts to the currently signed-in user.
 *
 * @param currentUserId the id of the real (non-anonymous) user now signed in
 * @param qc optional react-query client so the cart refetches immediately
 * @param explicitAnonId overrides the stored id (e.g. the in-memory anonymous
 *        user captured immediately before an in-place session swap)
 */
export async function claimAnonymousWork(
  currentUserId: string | null | undefined,
  qc?: QueryClient,
  explicitAnonId?: string | null,
): Promise<void> {
  const anonId = explicitAnonId || peekAnonymousUser();
  if (!anonId) return;

  if (currentUserId && anonId === currentUserId) {
    // The anonymous account was upgraded in place — nothing to transfer.
    clearAnonymousUser();
    return;
  }

  try {
    const { error } = await supabase.functions.invoke("claim-anonymous-orders", {
      body: { anonymous_user_id: anonId },
    });
    if (error) {
      console.warn("Failed to claim anonymous orders (will retry next sign-in):", error);
      return;
    }
    clearAnonymousUser();
  } catch (e) {
    console.warn("Failed to claim anonymous orders (will retry next sign-in):", e);
    return;
  } finally {
    if (qc) {
      invalidateUserOrderCaches(qc);
      await qc.refetchQueries({ queryKey: ["cart"] }).catch(() => null);
    }
  }
}
