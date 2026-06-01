import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "verifying" | "error";

export default function AuthVerify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    const tokenHash = params.get("token_hash");
    const type = (params.get("type") || "recovery") as
      | "recovery"
      | "email"
      | "invite"
      | "magiclink"
      | "signup"
      | "email_change";
    const next = params.get("next") || "/reset-password";

    if (!tokenHash) {
      setStatus("error");
      setErrorMsg("This link is missing required information.");
      return;
    }

    (async () => {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (error) {
        setStatus("error");
        const msg = (error.message || "").toLowerCase();
        const isExpired = msg.includes("expired") || msg.includes("invalid") || msg.includes("otp");
        setErrorMsg(
          isExpired
            ? "This sign-in link has expired (links are valid for 1 hour) or has already been used. Ask your admin to click \"Resend invite email\" from your branch staff page, and use the fresh link as soon as you receive it."
            : "We couldn't verify this link. Please ask your admin to resend the invitation."
        );
        return;
      }
      const sep = next.includes("?") ? "&" : "?";
      navigate(`${next}${sep}recovery=1`, { replace: true });
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {status === "verifying" && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Verifying your link…
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Please wait while we sign you in.
              </p>
            </div>
          </>
        )}
        {status === "error" && (
          <>
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-foreground">
                Link not valid
              </h1>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
            </div>
            <Button onClick={() => navigate("/auth", { replace: true })}>
              Go to sign in
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
