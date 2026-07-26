import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface PageInfo {
  tenant_name: string | null;
  tenant_logo_url: string | null;
  primary_color: string | null;
  branch_name: string | null;
  branch_city: string | null;
  contact_name_masked: string | null;
  contact_email_masked: string;
  is_active: boolean;
  already_completed: boolean;
}

type View = "loading" | "ready" | "submitting" | "sent" | "rate_limited" | "inactive" | "not_found" | "email_not_configured" | "error";

export default function Activate() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState<PageInfo | null>(null);
  const [view, setView] = useState<View>("loading");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!slug) { setView("not_found"); return; }
    (async () => {
      const { data, error } = await supabase.functions.invoke("get-activation-page", { body: { slug } });
      if (error || data?.error) {
        if (data?.error === "not_found") setView("not_found");
        else setView("error");
        return;
      }
      setPage(data as PageInfo);
      if (!data.is_active) setView("inactive");
      else setView("ready");
    })();
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !email.trim()) return;
    setView("submitting");
    const { data, error } = await supabase.functions.invoke("request-activation-email", {
      body: { slug, confirm_email: email.trim() },
    });
    if (error) { setView("error"); return; }
    if (data?.code === "rate_limited") { setView("rate_limited"); return; }
    if (data?.code === "inactive") { setView("inactive"); return; }
    if (data?.code === "email_not_configured") { setView("email_not_configured"); return; }
    // Always treat "sent_if_valid" as success — generic by design
    setView("sent");
  };

  const primary = page?.primary_color || "#0a2358";

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b" style={{ background: `linear-gradient(135deg, ${primary} 0%, #051640 100%)` }}>
          {page?.tenant_logo_url ? (
            <img src={page.tenant_logo_url} alt={page.tenant_name ?? ""} className="h-10 max-w-[200px] object-contain" />
          ) : (
            <div className="text-white text-lg font-semibold">{page?.tenant_name ?? "Document Centre"}</div>
          )}
        </div>

        <div className="p-8 space-y-5">
          {view === "loading" && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
          )}

          {view === "not_found" && (
            <div className="text-center space-y-3 py-4">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
              <h1 className="text-lg font-semibold">Activation link not found</h1>
              <p className="text-sm text-muted-foreground">
                This activation link doesn't exist or has been removed. If you received an email from us,
                please double-check the link or get in touch.
              </p>
            </div>
          )}

          {view === "inactive" && (
            <div className="text-center space-y-3 py-4">
              <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
              <h1 className="text-lg font-semibold">Activation paused</h1>
              <p className="text-sm text-muted-foreground">
                This activation page is currently disabled. Please get in touch with us if you believe this is in error.
              </p>
            </div>
          )}

          {view === "error" && (
            <div className="text-center space-y-3 py-4">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
              <h1 className="text-lg font-semibold">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">Please try again in a moment.</p>
              <Button variant="outline" onClick={() => window.location.reload()}>Try again</Button>
            </div>
          )}

          {(view === "ready" || view === "submitting") && page && (
            <>
              <div>
                <h1 className="text-xl font-semibold" style={{ color: primary }}>
                  Activate {page.branch_name}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Your <strong>{page.tenant_name}</strong> storefront is ready. Confirm the email address on file
                  and we'll send a one-time sign-in link.
                </p>
              </div>

              {page.already_completed && (
                <div className="flex items-start gap-2 text-xs bg-emerald-50 border border-emerald-200 rounded-md p-3 text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    This branch already has an active sign-in. If you've forgotten your password, you can still use
                    this page to request a fresh sign-in link.
                  </span>
                </div>
              )}

              <div className="bg-slate-50 border rounded-md p-3 text-xs text-slate-700">
                <div className="flex items-center gap-2 font-medium text-slate-900 mb-1">
                  <ShieldCheck className="h-4 w-4" /> Contact on file
                </div>
                <div>{page.contact_name_masked ?? "—"}</div>
                <div className="font-mono">{page.contact_email_masked}</div>
              </div>

              <form onSubmit={submit} className="space-y-3">
                <div>
                  <Label htmlFor="confirm-email">Confirm your email address</Label>
                  <Input
                    id="confirm-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@yourbranch.co.za"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={view === "submitting"}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Must match the contact email above. We'll never reveal the full address.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={view === "submitting" || !email.trim()}
                  style={{ background: primary }}>
                  {view === "submitting"
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
                    : <><Mail className="h-4 w-4 mr-2" />Email me a sign-in link</>}
                </Button>
              </form>
            </>
          )}

          {view === "sent" && (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
              <h1 className="text-lg font-semibold">Check your inbox</h1>
              <p className="text-sm text-muted-foreground">
                If the email matches the contact we have on file, a sign-in link is on its way.
                The link is valid for <strong>1 hour</strong> and can be opened as many times as you need
                until you've set your password.
              </p>
              <p className="text-xs text-muted-foreground">
                Didn't get it? Check spam, or try again in a minute.
              </p>
              <Button variant="outline" onClick={() => { setView("ready"); setEmail(""); }}>
                Request another link
              </Button>
            </div>
          )}

          {view === "rate_limited" && (
            <div className="text-center space-y-3 py-4">
              <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
              <h1 className="text-lg font-semibold">Too many requests</h1>
              <p className="text-sm text-muted-foreground">
                We've sent a few sign-in links for this branch recently. Please wait an hour and try again,
                or check your inbox (and spam) for the previous one.
              </p>
            </div>
          )}

          {view === "email_not_configured" && (
            <div className="text-center space-y-3 py-4">
              <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
              <h1 className="text-lg font-semibold">Email setup pending</h1>
              <p className="text-sm text-muted-foreground">
                We can't send your sign-in link right now because the sender mailbox for this site
                hasn't been fully set up. Please contact the team so they can finish configuring email —
                once that's done, come back and request a new link.
              </p>
            </div>
          )}
        </div>

        <div className="px-8 py-4 border-t bg-slate-50 text-center">
          <p className="text-xs text-muted-foreground">
            Powered by <button onClick={() => navigate("/")} className="underline">Document Centre</button>
          </p>
        </div>
      </div>
    </div>
  );
}
