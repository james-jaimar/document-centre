import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type State =
  | { kind: "loading" }
  | { kind: "error"; code: string; message: string };

const COPY: Record<string, string> = {
  not_found: "We couldn't find this welcome link. Ask your admin to resend the invite.",
  expired: "This welcome link has expired (links are valid for 1 hour). Ask your admin to resend the invite.",
  already_completed: "This welcome link has already been used to set a password. Just sign in with your new password — or ask your admin to resend if you've forgotten it.",
  use_limit_reached: "This welcome link has been opened too many times. Ask your admin to resend a fresh one.",
  missing_token: "This welcome link is missing required information. Ask your admin to resend the invite.",
  link_failed: "We couldn't generate a sign-in session for this link. Please try again or ask your admin to resend.",
  internal: "Something went wrong opening this welcome link. Please try again shortly.",
};

export default function Welcome() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState({ kind: "error", code: "missing_token", message: COPY.missing_token });
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("redeem-onboarding-token", {
          body: { token },
        });
        if (error || data?.error) {
          const code = data?.error ?? "internal";
          setState({ kind: "error", code, message: COPY[code] ?? COPY.internal });
          return;
        }
        if (data?.action_link) {
          window.location.replace(data.action_link);
          return;
        }
        setState({ kind: "error", code: "internal", message: COPY.internal });
      } catch (e: any) {
        setState({ kind: "error", code: "internal", message: COPY.internal });
      }
    })();
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {state.kind === "loading" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <div>
              <h1 className="text-xl font-semibold">Opening your welcome link…</h1>
              <p className="text-sm text-muted-foreground mt-2">Just a moment.</p>
            </div>
          </>
        )}
        {state.kind === "error" && (
          <>
            {state.code === "already_completed" ? (
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            ) : (
              <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            )}
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">
                {state.code === "already_completed" ? "All set" : "Welcome link unavailable"}
              </h1>
              <p className="text-sm text-muted-foreground">{state.message}</p>
            </div>
            <Button onClick={() => navigate("/auth", { replace: true })}>Go to sign in</Button>
          </>
        )}
      </div>
    </div>
  );
}
