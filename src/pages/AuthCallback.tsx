import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getDefaultRoute } from "@/hooks/useAuth";
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
        // Clean up — sign them out so they aren't left in a half-authed state
        // when the platform login rejects them.
        await supabase.auth.signOut();
        return;
      }

      toast.success("Signed in");

      if (tenantSlug) {
        navigate(`/t/${tenantSlug}/dashboard`, { replace: true });
        return;
      }

      // Platform login — route by highest role.
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      const priority = ["platform_admin", "head_office_admin", "branch_manager", "store_operator", "customer"] as const;
      const list = (roles ?? []).map((r) => r.role);
      const highest = priority.find((r) => list.includes(r)) ?? "customer";
      navigate(getDefaultRoute(highest as any), { replace: true });
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
