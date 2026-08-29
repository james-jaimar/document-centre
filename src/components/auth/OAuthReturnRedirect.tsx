import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { peekReturnPath, clearReturnPath, isSafeReturnPath } from "@/lib/auth/oauthReturn";

/**
 * Safety net for OAuth sign-ins that land somewhere other than /auth/callback
 * (e.g. the provider drops the user on the site root). If a fresh return path
 * was recorded before sign-in and we now have a real (non-anonymous) session,
 * send the user back to where they were — typically the cart or checkout.
 */
const OAuthReturnRedirect = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || loading) return;
    // Let AuthCallback own its own flow.
    if (location.pathname.startsWith("/auth/callback")) return;
    if (!user || (user as { is_anonymous?: boolean }).is_anonymous) return;

    const target = peekReturnPath();
    if (!isSafeReturnPath(target)) return;

    done.current = true;
    clearReturnPath();

    const current = location.pathname + location.search;
    if (current === target) return;
    navigate(target, { replace: true });
  }, [user, loading, location.pathname, location.search, navigate]);

  return null;
};

export default OAuthReturnRedirect;
