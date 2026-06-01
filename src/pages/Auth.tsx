import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, getDefaultRoute } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Printer, Info } from "lucide-react";
import { toast } from "sonner";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { pickPrimaryMembership, resolveTenantLanding, type LandingMembership } from "@/lib/auth/landingRoute";
import { buildAdminPath } from "@/lib/adminRouting";

type AuthMode = "login" | "register" | "forgot";

const Auth = () => {
  const navigate = useNavigate();
  const { slug: tenantSlug, tenantPath } = useTenantSlug();
  const [searchParams] = useSearchParams();
  const { user, highestRole, loading: authLoading, rolesLoaded } = useAuth();
  const { tenant: brandedTenant, loading: tenantLoading } = useTenantFromSlug();
  const { data: branding, isLoading: brandingLoading } = useTenantBranding(brandedTenant?.id ?? null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [gating, setGating] = useState(false);

  const isTenantPortal = !!tenantSlug;

  // Post-login gating: route by role + tenant context. Sign out and bounce
  // anyone who landed at the wrong door. CRITICAL: wait for `rolesLoaded`
  // before deciding — otherwise platform admins (who have empty `roles` for
  // a brief tick after sign-in) get misclassified as tenant members and
  // bounced into a sign-in loop.
  useEffect(() => {
    if (!user || authLoading || !rolesLoaded || gating) return;

    // Anonymous users (from storefront bootstrap) should see the login form,
    // not be auto-redirected. Sign them out so they can use real credentials.
    if ((user as any).is_anonymous) {
      supabase.auth.signOut();
      return;
    }

    (async () => {
      setGating(true);
      try {
        // Platform admins on a tenant portal land in that tenant's admin
        // console (with ?tenant= override) so they can actually administer.
        // On the generic /auth they go to /platform.
        if (highestRole === "platform_admin") {
          if (isTenantPortal) {
            const { data: t } = await supabase
              .from("tenants")
              .select("id")
              .eq("slug", tenantSlug!)
              .maybeSingle();
            if (t?.id) {
              navigate(buildAdminPath("/admin", t.id), { replace: true });
            } else {
              navigate("/platform", { replace: true });
            }
          } else {
            navigate("/platform", { replace: true });
          }
          return;
        }

        // Look up this user's tenant memberships (active only).
        const { data: memberships } = await supabase
          .from("tenant_memberships")
          .select("tenant_id, role, branch_id, tenants:tenant_id(slug, name)")
          .eq("profile_id", user.id)
          .eq("is_active", true);

        const list = (memberships ?? []) as LandingMembership[];

        // Helper: safely apply ?redirect= if it's a same-origin path within this tenant.
        const rawRedirect = searchParams.get("redirect");
        const safeRedirect =
          rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
            ? rawRedirect
            : null;

        if (isTenantPortal) {
          // On /t/:slug/auth — user must have a membership for THIS tenant.
          const matchSlug = list.find((m) => m.tenants?.slug === tenantSlug);
          if (matchSlug) {
            const primary = pickPrimaryMembership(list, tenantSlug ?? null) ?? matchSlug;
            const target = safeRedirect ?? resolveTenantLanding(primary, tenantSlug ?? null);
            navigate(target, { replace: true });
            return;
          }
          // Wrong tenant — sign out and explain.
          await supabase.auth.signOut();
          setError(
            brandedTenant
              ? `Your account isn't part of ${brandedTenant.name}. Please use the correct portal.`
              : "Your account isn't part of this organisation. Please use the correct portal.",
          );
          return;
        }

        // On generic /auth — only platform staff or staff with no tenant should be here.
        if (list.length === 0) {
          // No tenant, no platform role — orphan.
          await supabase.auth.signOut();
          setError("This portal is for platform staff. Please use your organisation's sign-in page.");
          return;
        }

        // Tenant member landed on generic /auth — bounce them to their portal.
        const primary = pickPrimaryMembership(list, null) ?? list[0];
        const targetSlug = primary.tenants?.slug;
        await supabase.auth.signOut();
        if (targetSlug) {
          toast.info("Please sign in via your organisation's portal.");
          navigate(`/t/${targetSlug}/auth?email=${encodeURIComponent(email || user.email || "")}`, {
            replace: true,
          });
        } else {
          setError("Please sign in via your organisation's portal.");
        }
      } finally {
        setGating(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, highestRole, authLoading, rolesLoaded]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError("Please enter both email and password");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isTenantPortal) {
      setError("Sign-up is only available via your organisation's portal.");
      return;
    }
    if (!email) return setError("Please enter your email");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-signup", {
        body: { email, display_name: displayName, tenant_slug: tenantSlug },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Check your email to set your password and sign in.");
      setMode("login");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isTenantPortal) {
      setError("Password reset is only available via your organisation's portal.");
      return;
    }
    if (!email) return setError("Please enter your email");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-password-reset", {
        body: { email, tenant_slug: tenantSlug },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("If an account exists, a reset link is on its way.");
      setMode("login");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const submitHandler =
    mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgotPassword;

  // Dynamically set favicon for tenant portal
  useEffect(() => {
    if (!isTenantPortal || !branding?.favicon_url) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      const original = link.href;
      link.href = branding.favicon_url;
      return () => { link.href = original; };
    }
  }, [isTenantPortal, branding?.favicon_url]);

  // Resolve a usable brand colour. Fall back to the portal's slate/red default
  // (#1a1a2e is the "no brand set" sentinel from useTenantBranding).
  const brandColor = useMemo(() => {
    if (isTenantPortal && branding?.primary_color && branding.primary_color !== "#1a1a2e") {
      return branding.primary_color;
    }
    return null;
  }, [isTenantPortal, branding?.primary_color]);

  // Expose brand colour as a CSS variable so we can tint blobs, focus rings,
  // and buttons consistently without prop-drilling colours into every element.
  const brandVarsStyle = useMemo(
    () =>
      brandColor
        ? ({ ["--brand" as any]: brandColor } as React.CSSProperties)
        : undefined,
    [brandColor],
  );

  const primaryBtnStyle = useMemo<React.CSSProperties | undefined>(
    () =>
      brandColor
        ? {
            backgroundColor: brandColor,
            borderColor: brandColor,
            boxShadow: `0 10px 25px -10px ${brandColor}55`,
          }
        : undefined,
    [brandColor],
  );

  const accentTextStyle = useMemo<React.CSSProperties | undefined>(
    () => (brandColor ? { color: brandColor } : undefined),
    [brandColor],
  );

  // Branded splash while tenant + branding load on tenant portals, so the
  // generic Printer icon / default gradient never flashes before the tenant
  // logo and brand colours arrive.
  if (isTenantPortal && (tenantLoading || brandingLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="flex flex-col items-center gap-6">
          {brandedTenant?.logo_url ? (
            <img
              src={brandedTenant.logo_url}
              alt={brandedTenant?.name ?? ""}
              className="h-12 w-auto max-w-[220px] object-contain opacity-80"
            />
          ) : null}
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200"
            style={{ borderTopColor: brandColor ?? "#0f172a" }}
          />
        </div>
      </div>
    );
  }

  const heading = isTenantPortal
    ? mode === "login"
      ? `Sign in to ${brandedTenant?.name ?? "your portal"}`
      : mode === "register"
      ? "Create your account"
      : "Reset your password"
    : mode === "login"
    ? "Platform sign-in"
    : mode === "register"
    ? "Create account"
    : "Reset password";

  const subheading = isTenantPortal
    ? mode === "login"
      ? "Welcome back to the portal"
      : mode === "register"
      ? `Join ${brandedTenant?.name ?? "the portal"} to get started`
      : "Enter your email and we'll send a reset link"
    : "Platform staff sign-in";

  return (
    <div
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#f8f9fa] px-4 py-10"
      style={brandVarsStyle}
    >
      {/* Atmospheric background blobs — brand-tinted */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-[10%] -top-[10%] h-[45%] w-[45%] rounded-full opacity-60 blur-[120px]"
          style={{
            background: brandColor
              ? `radial-gradient(circle, ${brandColor}22 0%, transparent 70%)`
              : "rgba(15, 23, 42, 0.06)",
          }}
        />
        <div className="absolute -bottom-[10%] -right-[10%] h-[45%] w-[45%] rounded-full bg-slate-200 opacity-40 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-[460px]">
        <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.08)] sm:p-10 md:p-12">
          {/* Brand Header */}
          <div className="mb-8 flex flex-col items-center text-center">
            {isTenantPortal && brandedTenant?.logo_url ? (
              <img
                src={brandedTenant.logo_url}
                alt={`${brandedTenant.name} logo`}
                className="mb-6 h-14 w-auto max-w-[220px] object-contain"
              />
            ) : isTenantPortal && brandedTenant ? (
              <span
                className="mb-6 text-3xl font-black italic uppercase tracking-tighter"
                style={accentTextStyle}
              >
                {brandedTenant.name}
              </span>
            ) : (
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Printer className="h-7 w-7" />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{heading}</h1>
            <p className="mt-2 text-sm text-gray-500">{subheading}</p>
          </div>

          {!isTenantPortal && (
            <Alert className="mb-5">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Customer or team member? Sign in through your organisation's portal using the link your admin sent you.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="mb-5">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={submitHandler} className="space-y-5">
            {mode === "register" && isTenantPortal && (
              <div>
                <label
                  htmlFor="displayName"
                  className="mb-2 ml-1 block text-xs font-bold uppercase tracking-wider text-gray-500"
                >
                  Name
                </label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="h-auto rounded-xl border-gray-200 bg-gray-50 px-5 py-4 text-gray-900 placeholder:text-gray-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-offset-0"
                  style={brandColor ? ({ ["--tw-ring-color" as any]: `${brandColor}33` } as React.CSSProperties) : undefined}
                />
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="mb-2 ml-1 block text-xs font-bold uppercase tracking-wider text-gray-500"
              >
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                className="h-auto rounded-xl border-gray-200 bg-gray-50 px-5 py-4 text-gray-900 placeholder:text-gray-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-offset-0"
              />
            </div>

            {mode !== "forgot" && (
              <div>
                <div className="mb-2 ml-1 flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-xs font-bold uppercase tracking-wider text-gray-500"
                  >
                    Password
                  </label>
                  {isTenantPortal && mode === "login" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs font-semibold hover:underline"
                      style={accentTextStyle}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-auto rounded-xl border-gray-200 bg-gray-50 px-5 py-4 text-gray-900 placeholder:text-gray-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-offset-0"
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || gating}
              className="mt-2 h-auto w-full rounded-xl py-4 text-base font-bold text-white transition-all active:scale-[0.98] hover:brightness-95"
              style={primaryBtnStyle}
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                ? "Sign In"
                : mode === "register"
                ? "Create Account"
                : "Send Reset Link"}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-4 font-medium tracking-widest text-gray-400">OR</span>
            </div>
          </div>

          <SocialAuthButtons tenantSlug={tenantSlug ?? null} />

          {/* Footer link — sign up / back to sign in */}
          {isTenantPortal && (
            <div className="mt-8 text-center text-sm text-gray-500">
              {mode === "login" && (
                <p>
                  Don't have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className="font-bold hover:underline"
                    style={accentTextStyle}
                  >
                    Sign up
                  </button>
                </p>
              )}
              {mode !== "login" && (
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="font-bold hover:underline"
                  style={accentTextStyle}
                >
                  Back to sign in
                </button>
              )}
            </div>
          )}
        </div>

        {/* Security note */}
        <div className="mt-6 flex items-center justify-center gap-2 text-gray-400">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <span className="text-xs font-medium">Secure, encrypted connection</span>
        </div>
      </div>
    </div>
  );
};

export default Auth;
