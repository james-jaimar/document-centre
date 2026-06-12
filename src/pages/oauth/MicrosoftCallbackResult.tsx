// Popup result page for the Microsoft OAuth connect flow.
//
// Why this exists: Supabase Edge Functions rewrite text/html GET responses
// to text/plain (documented behaviour), so the Edge Function callback can
// not render an HTML close-page directly. Instead the function redirects
// here with ?success=true/false&email=...&error=... and this React page
// renders the UI, postMessages the opener, and closes the popup.
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, AlertCircle } from "lucide-react";

export default function MicrosoftCallbackResult() {
  const [params] = useSearchParams();
  const success = params.get("success") === "true";
  const email = params.get("email") || "";
  const error = params.get("error") || "";

  useEffect(() => {
    try {
      const payload = success
        ? { type: "microsoft-oauth-callback", success: true, email }
        : { type: "microsoft-oauth-callback", success: false, error };
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, "*");
      }
    } catch {
      // ignore
    }
    const t = window.setTimeout(() => {
      try { window.close(); } catch { /* ignore */ }
    }, success ? 600 : 2500);
    return () => window.clearTimeout(t);
  }, [success, email, error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm w-full bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm">
        {success ? (
          <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
        ) : (
          <AlertCircle className="h-12 w-12 text-red-600 mx-auto" />
        )}
        <h1 className="mt-4 text-lg font-semibold text-slate-900">
          {success ? "Mailbox connected" : "Connection failed"}
        </h1>
        {success && email && (
          <p className="mt-2 text-sm text-slate-600">{email}</p>
        )}
        {!success && error && (
          <p className="mt-2 text-sm text-red-700 break-words">{error}</p>
        )}
        <p className="mt-5 text-xs text-slate-400">
          This window will close automatically.
        </p>
      </div>
    </div>
  );
}
