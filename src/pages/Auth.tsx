import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, getDefaultRoute } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  // Build branded background style
  const bgStyle = useMemo(() => {
    if (isTenantPortal && branding?.primary_color && branding.primary_color !== "#1a1a2e") {
      return {
        background: `linear-gradient(135deg, ${branding.primary_color} 0%, ${branding.secondary_color || branding.primary_color} 100%)`,
      };
    }
    return undefined;
  }, [isTenantPortal, branding?.primary_color, branding?.secondary_color]);

  const btnStyle = useMemo(() => {
    if (isTenantPortal && branding?.primary_color && branding.primary_color !== "#1a1a2e") {
      return { backgroundColor: branding.primary_color, borderColor: branding.primary_color };
    }
    return undefined;
  }, [isTenantPortal, branding?.primary_color]);

  // Branded splash while tenant + branding load on tenant portals, so the
  // generic Printer icon / default gradient never flashes before the tenant
  // logo and brand colours arrive.
  if (isTenantPortal && (tenantLoading || brandingLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" style={bgStyle}>
        <div className="flex flex-col items-center gap-6">
          {brandedTenant?.logo_url ? (
            <img
              src={brandedTenant.logo_url}
              alt={brandedTenant?.name ?? ""}
              className="h-14 w-auto max-w-[220px] object-contain opacity-90"
            />
          ) : null}
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white/80" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[hsl(222,47%,11%)] to-[hsl(215,70%,25%)]"
      style={bgStyle}
    >
      <div className="w-full max-w-md px-4">
        <Card className="shadow-2xl">
          <CardHeader className="text-center">
            {isTenantPortal && brandedTenant?.logo_url ? (
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl">
                <img
                  src={brandedTenant.logo_url}
                  alt={`${brandedTenant.name} logo`}
                  className="max-h-20 max-w-20 object-contain"
                />
              </div>
            ) : (
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Printer className="h-7 w-7" />
              </div>
            )}
            <CardTitle className="text-2xl font-bold">
              {isTenantPortal && brandedTenant
                ? brandedTenant.name
                : mode === "login"
                ? "Welcome Back"
                : mode === "register"
                ? "Create Account"
                : "Reset Password"}
            </CardTitle>
            <CardDescription>
              {isTenantPortal
                ? mode === "login"
                  ? `Sign in to ${brandedTenant?.name ?? "your portal"}`
                  : mode === "register"
                  ? `Create your ${brandedTenant?.name ?? ""} account`.trim()
                  : "Enter your email to reset your password"
                : "Platform staff sign-in"}
            </CardDescription>
          </CardHeader>

          <form onSubmit={submitHandler}>
            <CardContent className="space-y-4">
              {!isTenantPortal && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Customer or team member? Sign in through your organisation's portal using the link your admin sent you.
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {mode === "register" && isTenantPortal && (
                <div className="space-y-2">
                  <Label htmlFor="displayName">Name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              {mode !== "forgot" && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              )}

              <div className="relative pt-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <SocialAuthButtons tenantSlug={tenantSlug ?? null} />
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading || gating} style={btnStyle}>
                {loading
                  ? "Please wait..."
                  : mode === "login"
                  ? "Sign In"
                  : mode === "register"
                  ? "Create Account"
                  : "Send Reset Link"}
              </Button>

              {/* Only tenant portals expose register / forgot flows. */}
              {isTenantPortal && (
                <div className="flex w-full flex-col gap-1 text-center text-sm text-muted-foreground">
                  {mode === "login" && (
                    <>
                      <button type="button" className="hover:text-primary" onClick={() => setMode("forgot")}>
                        Forgot password?
                      </button>
                      <button type="button" className="hover:text-primary" onClick={() => setMode("register")}>
                        Don't have an account? <span className="font-medium text-primary">Sign up</span>
                      </button>
                    </>
                  )}
                  {mode !== "login" && (
                    <button type="button" className="hover:text-primary" onClick={() => setMode("login")}>
                      Back to sign in
                    </button>
                  )}
                </div>
              )}
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
