import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getDefaultRoute } from "@/hooks/useAuth";
import { pickPrimaryMembership, resolveTenantLanding, type LandingMembership } from "@/lib/auth/landingRoute";
import { buildAdminPath } from "@/lib/adminRouting";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

const AuthCallback = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const tenantSlug = params.get("tenant");

    const run = async () => {
      // Wait briefly for Supabase to process the OAuth callback hash and persist the session.
      let session = null;
      for (let i = 0; i < 30; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          session = data.session;
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      if (!session) {
        setError("Sign-in did not complete. Please try again.");
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("oauth-callback", {
        body: { tenant_slug: tenantSlug },
      });

      if (fnError || (data as any)?.error) {
        const msg = (data as any)?.error || fnError?.message || "Sign-in failed";
        setError(msg);
        await supabase.auth.signOut();
        return;
      }

      // Resolve roles + memberships in parallel.
      const [rolesRes, membershipsRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", session.user.id),
        supabase
          .from("tenant_memberships")
          .select("tenant_id, role, branch_id, tenants:tenant_id(slug, name)")
          .eq("profile_id", session.user.id)
          .eq("is_active", true),
      ]);

      const priority = ["platform_admin", "head_office_admin", "branch_manager", "store_operator", "customer"] as const;
      const roleList = (rolesRes.data ?? []).map((r) => r.role);
      const highest = priority.find((r) => roleList.includes(r)) ?? null;
      const memberships = (membershipsRes.data ?? []) as LandingMembership[];

      // Tenant-scoped OAuth flow — platform admins are allowed in regardless;
      // otherwise route by membership role for this tenant.
      if (tenantSlug) {
        if (highest === "platform_admin") {
          const { data: t } = await supabase
            .from("tenants")
            .select("id")
            .eq("slug", tenantSlug)
            .maybeSingle();
          toast.success("Signed in");
          if (t?.id) {
            navigate(buildAdminPath("/admin", t.id), { replace: true });
          } else {
            navigate("/platform", { replace: true });
          }
          return;
        }
        const match = memberships.find((m) => m.tenants?.slug === tenantSlug);
        if (match) {
          const primary = pickPrimaryMembership(memberships, tenantSlug) ?? match;
          toast.success("Signed in");
          navigate(resolveTenantLanding(primary, tenantSlug), { replace: true });
          return;
        }
        await supabase.auth.signOut();
        setError("Your account isn't part of this organisation. Please use the correct portal.");
        return;
      }

      // Generic /auth/callback — platform staff allowed; tenant members get bounced; orphans rejected.
      if (highest === "platform_admin") {
        toast.success("Signed in");
        navigate(getDefaultRoute(highest as any), { replace: true });
        return;
      }

      if (memberships.length > 0) {
        const primary = pickPrimaryMembership(memberships, null) ?? memberships[0];
        const targetSlug = primary.tenants?.slug;
        await supabase.auth.signOut();
        if (targetSlug) {
          toast.info("Please sign in via your organisation's portal.");
          navigate(`/t/${targetSlug}/auth`, { replace: true });
        } else {
          setError("Please sign in via your organisation's portal.");
        }
        return;
      }

      // No platform role, no tenant membership.
      await supabase.auth.signOut();
      setError("This portal is for platform staff. Please use your organisation's sign-in page.");
    };

    run();
  }, [params, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[hsl(222,47%,11%)] to-[hsl(215,70%,25%)] p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardContent className="space-y-4 pt-6">
          {error ? (
            <>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button
                className="w-full"
                onClick={() => {
                  const tenantSlug = params.get("tenant");
                  navigate(tenantSlug ? `/t/${tenantSlug}/auth` : "/auth", { replace: true });
                }}
              >
                Back to sign in
              </Button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Completing sign-in…</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthCallback;
