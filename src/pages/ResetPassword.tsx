import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { KeyRound, Loader2, Printer } from "lucide-react";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useTenantFromSlug } from "@/hooks/useTenantFromSlug";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { useDocumentBranding } from "@/hooks/useDocumentBranding";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);

  const { slug: tenantSlug } = useTenantSlug();
  const { tenant: brandedTenant, loading: tenantLoading } = useTenantFromSlug();
  const { data: branding, isLoading: brandingLoading } = useTenantBranding(brandedTenant?.id ?? null);
  const isTenantPortal = !!tenantSlug;

  useDocumentBranding(
    brandedTenant?.id ?? null,
    brandedTenant?.name ?? null,
    "Reset password",
  );

  useEffect(() => {
    (async () => {
      const hasLegacyHash = window.location.hash.includes("type=recovery");
      const hasRecoveryParam = searchParams.get("recovery") === "1";
      const { data } = await supabase.auth.getSession();
      const hasSession = !!data.session;

      if (hasLegacyHash || hasRecoveryParam || hasSession) {
        setIsRecovery(true);
      }
      setChecking(false);
    })();
  }, [searchParams]);

  const brandColor = useMemo(() => {
    if (isTenantPortal && branding?.primary_color && branding.primary_color !== "#1a1a2e") {
      return branding.primary_color;
    }
    return null;
  }, [isTenantPortal, branding?.primary_color]);

  const brandVarsStyle = useMemo(
    () => (brandColor ? ({ ["--brand" as any]: brandColor } as React.CSSProperties) : undefined),
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

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Clear the "must change password" flag set by a welcome email so the
      // portal guard stops redirecting them here.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("profiles")
            .update({ must_change_password: false })
            .eq("id", user.id);
        }
      } catch {
        /* best-effort */
      }
      // If this came from a reusable welcome link (branch activation), mark
      // the onboarding token consumed and drop the user straight into their
      // branch admin — do NOT sign them out.
      const welcomeToken = searchParams.get("welcome_token");
      const next = searchParams.get("next");
      if (welcomeToken) {
        try {
          await supabase.functions.invoke("complete-onboarding-token", {
            body: { token: welcomeToken },
          });
        } catch {
          /* best-effort */
        }
        toast.success("Password set — welcome to your branch.");
        navigate(next === "branch" ? "/branch" : "/branch", { replace: true });
        return;
      }
      toast.success("Password updated successfully. Please sign in with your new password.");
      await supabase.auth.signOut();
      const m = window.location.pathname.match(/^\/t\/([^/]+)(?:\/([^/]+))?/);
      const authPath = m
        ? (m[2] ? `/t/${m[1]}/${m[2]}/auth` : `/t/${m[1]}/auth`)
        : "/auth";
      navigate(authPath, { replace: true });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }

  };

  if (checking || (isTenantPortal && (tenantLoading || brandingLoading))) {
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
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: brandColor ?? "#0f172a" }} />
        </div>
      </div>
    );
  }

  const authBgUrl = isTenantPortal ? branding?.auth_background_url?.trim() : "";
  const authBgColor = isTenantPortal ? branding?.auth_background_color?.trim() : "";
  const resolvedLogoUrl = (isTenantPortal ? branding?.logo_url?.trim() : "") || brandedTenant?.logo_url || "";

  if (!isRecovery) {
    return (
      <div
        className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#f8f9fa] px-4 py-10"
        style={brandVarsStyle}
      >
        <div className="relative w-full max-w-[460px]">
          <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.08)] sm:p-10 md:p-12 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Invalid link</h1>
            <p className="mt-2 text-sm text-gray-500">This password reset link is invalid or has expired.</p>
            <Button
              className="mt-6 w-full"
              style={primaryBtnStyle}
              onClick={() => {
                const path = tenantSlug ? `/t/${tenantSlug}/auth` : "/auth";
                navigate(path);
              }}
            >
              Back to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-10"
      style={{ ...(brandVarsStyle ?? {}), backgroundColor: authBgColor || "#f8f9fa" }}
    >
      {authBgUrl && (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${authBgUrl})`, opacity: 0.5 }}
            aria-hidden="true"
          />
          <div className="pointer-events-none absolute inset-0 bg-white/40" aria-hidden="true" />
        </>
      )}

      {!authBgUrl && (
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
      )}

      <div className="relative w-full max-w-[460px]">
        <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.08)] sm:p-10 md:p-12">
          <div className="mb-8 flex flex-col items-center text-center">
            {isTenantPortal && resolvedLogoUrl ? (
              <img
                src={resolvedLogoUrl}
                alt={`${brandedTenant?.name ?? "Portal"} logo`}
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
                <KeyRound className="h-7 w-7" />
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Set new password</h1>
            <p className="mt-2 text-sm text-gray-500">Enter your new password below</p>
          </div>

          <form onSubmit={handleReset} className="space-y-5">
            <div>
              <label
                htmlFor="password"
                className="mb-2 ml-1 block text-xs font-bold uppercase tracking-wider text-gray-500"
              >
                New password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-auto rounded-xl border-gray-200 bg-gray-50 px-5 py-4 text-gray-900 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-offset-0"
                style={brandColor ? ({ ["--tw-ring-color" as any]: `${brandColor}33` } as React.CSSProperties) : undefined}
              />
            </div>
            <div>
              <label
                htmlFor="confirm"
                className="mb-2 ml-1 block text-xs font-bold uppercase tracking-wider text-gray-500"
              >
                Confirm password
              </label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="h-auto rounded-xl border-gray-200 bg-gray-50 px-5 py-4 text-gray-900 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-offset-0"
                style={brandColor ? ({ ["--tw-ring-color" as any]: `${brandColor}33` } as React.CSSProperties) : undefined}
              />
            </div>

            <Button
              type="submit"
              className="h-auto w-full rounded-xl py-4 text-base font-semibold"
              style={primaryBtnStyle}
              disabled={loading}
            >
              {loading ? "Updating..." : "Update password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
