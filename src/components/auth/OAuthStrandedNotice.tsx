import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

/**
 * Detects a sign-in that was returned to the platform home page instead of the
 * page it started from (typically a tenant's own domain whose callback address
 * has not been allow-listed in Supabase Auth). Rather than silently showing the
 * marketing page, we explain what happened and offer a way back.
 *
 * Returns `null` when the current URL carries no sign-in artefacts.
 */
export function useStrandedOAuth(): { message: string } | null {
  const [state, setState] = useState<{ message: string } | null>(null);

  useEffect(() => {
    if (window.location.pathname !== "/") return;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);

    const errorDescription =
      query.get("error_description") ?? hash.get("error_description") ?? null;
    const errorCode = query.get("error") ?? hash.get("error") ?? null;
    const hasToken = !!hash.get("access_token");

    if (errorDescription || errorCode) {
      setState({
        message:
          errorDescription ??
          "Your sign-in could not be completed and you were returned to the Document Centre home page.",
      });
      return;
    }

    if (hasToken) {
      setState({
        message:
          "Your sign-in was returned to the Document Centre home page instead of the shop you started from.",
      });
    }
  }, []);

  return state;
}

export default function OAuthStrandedNotice({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardContent className="space-y-4 pt-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            Please go back to the shop's own web address and try signing in again. If it keeps
            happening, the shop's sign-in return address still needs to be approved.
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                window.history.length > 1
                  ? window.history.back()
                  : (window.location.href = "/");
              }}
            >
              Go back
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Document Centre home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
