import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { IMPERSONATION_ACTIVE_KEY } from "@/contexts/ImpersonationContext";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Consumes a magiclink token minted by `impersonate-customer` and lands the
 * new tab on the customer portal with the customer's session active. The
 * staff tab is never touched.
 */
export default function ImpersonationConsume() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get("token_hash");
      const impersonation_id = params.get("impersonation_id");
      const expires_at = params.get("expires_at");
      const redirect = params.get("redirect") || "/";
      const targetRaw = params.get("target");

      if (!token_hash || !impersonation_id || !expires_at || !targetRaw) {
        setError("Missing impersonation parameters.");
        return;
      }

      // Make sure this tab doesn't inherit some other auth state.
      try { await supabase.auth.signOut(); } catch { /* noop */ }

      const { error: vErr } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash,
      } as any);
      if (cancelled) return;
      if (vErr) {
        setError(vErr.message || "Could not start impersonation session.");
        return;
      }

      try {
        sessionStorage.setItem(
          IMPERSONATION_ACTIVE_KEY,
          JSON.stringify({
            impersonation_id,
            expires_at,
            return_to: redirect,
            target: JSON.parse(targetRaw),
          }),
        );
      } catch {
        /* noop */
      }

      window.location.replace(redirect);
    };

    run();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full bg-card border rounded-lg p-6 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <h1 className="text-lg font-semibold">Could not log in as customer</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={() => window.close()}>Close tab</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Starting customer session…</span>
      </div>
    </div>
  );
}
