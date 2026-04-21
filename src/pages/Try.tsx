import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, Loader2 } from "lucide-react";

/**
 * Public "Try it now" entry point.
 *
 * 1. Creates an anonymous Supabase user with `is_demo: true` metadata.
 *    The `handle_new_user` trigger auto-joins them to the demo tenant.
 * 2. Calls `demo-bootstrap` as a belt-and-braces idempotent fallback.
 * 3. Redirects them straight into the demo storefront.
 */
export default function Try() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // If already signed in, just go straight in.
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (existing?.user) {
          await supabase.functions.invoke("demo-bootstrap").catch(() => null);
          if (!cancelled) navigate("/t/demo/print-centre", { replace: true });
          return;
        }

        const { error: signInErr } = await supabase.auth.signInAnonymously({
          options: { data: { is_demo: true, display_name: "Demo Visitor" } },
        });
        if (signInErr) throw signInErr;

        // Wait briefly for the trigger to wire profile + membership
        await new Promise((r) => setTimeout(r, 400));

        const { error: bootErr } = await supabase.functions.invoke("demo-bootstrap");
        if (bootErr) {
          console.warn("demo-bootstrap warning:", bootErr);
        }

        if (!cancelled) navigate("/t/demo/print-centre", { replace: true });
      } catch (e: any) {
        console.error("Try entry failed:", e);
        if (!cancelled) {
          setError(
            e?.message?.includes("anonymous")
              ? "Anonymous sign-in is not enabled. Please enable it in Supabase Auth settings."
              : e?.message ?? "Failed to start demo. Please try again."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[hsl(222,47%,11%)] to-[hsl(215,70%,25%)] px-6">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-2xl text-center">
        {error ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">Couldn't start the demo</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button
              onClick={() => navigate("/")}
              className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Back to home
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-foreground mb-2">Spinning up your demo…</h1>
            <p className="text-sm text-muted-foreground">
              No signup needed. You'll be in your Print Centre in a moment.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
