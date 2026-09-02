import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useState } from "react";
import { useParams } from "react-router-dom";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { claimAnonymousWork, clearAnonymousUser } from "@/lib/auth/claimAnonymousWork";


type AuthTab = "register" | "login";

export default function CheckoutAuth() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { slug, tenantPath } = useTenantSlug();
  const [tab, setTab] = useState<AuthTab>("register");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Register fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Login fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const isAnonymous = !!(user as any)?.is_anonymous;

  // Fully authenticated (non-anonymous) user — show confirmed state
  if (user && !isAnonymous) {
    return (
      <div className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Signed in as {user.email}</p>
            <p className="text-xs text-muted-foreground">You're ready to place your order.</p>
          </div>
        </div>
      </div>
    );
  }

  const isEmailTakenError = (msg: string) => {
    const m = (msg || "").toLowerCase();
    return (
      m.includes("already been registered") ||
      m.includes("already registered") ||
      m.includes("user already exists") ||
      m.includes("email address is already") ||
      m.includes("email_exists")
    );
  };

  // Attach the signed-in login to this tenant as a customer (safe to call repeatedly)
  const ensureMembership = async () => {
    if (!slug) return;
    try {
      const { error: memErr } = await supabase.functions.invoke("ensure-tenant-membership", {
        body: {
          tenant_slug: slug,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          phone: phone.trim() || null,
        },
      });
      if (memErr) console.warn("Failed to attach account to tenant:", memErr);
    } catch (e) {
      console.warn("Failed to attach account to tenant:", e);
    }
  };

  const claimAnonOrders = async (anonUserId: string | null) => {
    // The cart query re-keys to the new user id the moment the session swaps,
    // which happens before the transfer finishes — the shared helper refetches
    // once the claim completes so the cart appears instead of "cart is empty".
    const { data } = await supabase.auth.getUser();
    await claimAnonymousWork(data.user?.id ?? null, qc, anonUserId);
  };


  // The email already has a login (possibly created on another tenant).
  // Sign them in with the password they typed and enrol them here.
  const recoverExistingLogin = async (anonUserId: string | null) => {
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInErr) {
      setLoginEmail(email.trim());
      setTab("login");
      setError(
        "You already have a login for this email. Enter your password to continue, or reset it below.",
      );
      return false;
    }
    await claimAnonOrders(anonUserId);
    await ensureMembership();
    toast.success("Signed in — you're ready to place your order.");
    return true;
  };

  const handleResetPassword = async () => {
    const target = (loginEmail || email).trim();
    if (!target) {
      setError("Enter your email address first.");
      return;
    }
    setLoading(true);
    try {
      const { error: resetErr } = await supabase.functions.invoke("request-password-reset", {
        body: { email: target, tenant_slug: slug ?? null },
      });
      if (resetErr) throw resetErr;
      toast.success("Password reset email sent.");
    } catch (err: any) {
      setError(err.message || "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  };

  // Convert anonymous user to a real account
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !email.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      if (isAnonymous) {
        const anonUserId = user!.id;
        // Convert the anonymous user to a permanent account
        const { error: updateErr } = await supabase.auth.updateUser({
          email: email.trim(),
          password,
          data: {
            display_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            tenant_slug: slug,
          },
        });
        if (updateErr) {
          if (isEmailTakenError(updateErr.message)) {
            await recoverExistingLogin(anonUserId);
            return;
          }
          throw updateErr;
        }

        // Update the profile with name/email
        await supabase
          .from("profiles")
          .update({
            display_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim(),
            phone: phone.trim() || null,
            is_demo: false,
          })
          .eq("id", user!.id);

        await ensureMembership();
        clearAnonymousUser();
        toast.success("Account created! You can now place your order.");
      } else {
        // No session at all — create via request-signup + auto sign-in
        const { data, error: fnErr } = await supabase.functions.invoke("request-signup", {
          body: {
            email: email.trim(),
            display_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim() || null,
            tenant_slug: slug,
            password: password,
          },
        });
        const fnMessage = (fnErr as any)?.message || (data as any)?.error || "";
        if (fnMessage && isEmailTakenError(String(fnMessage))) {
          await recoverExistingLogin(null);
          return;
        }
        if (fnErr) throw fnErr;
        if ((data as any)?.error) throw new Error((data as any).error);

        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) {
          // Account exists with a different password
          setLoginEmail(email.trim());
          setTab("login");
          setError(
            "You already have a login for this email. Enter your password to continue, or reset it below.",
          );
          return;
        }
        await ensureMembership();
        toast.success("Account created!");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  };

  // Sign into existing account — need to transfer anonymous orders
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const anonUserId = isAnonymous ? user!.id : null;

      // Sign in directly — Supabase replaces the anonymous session in place,
      // so the user never transitions through a `null` state (which would
      // trigger the customer-portal anonymous bootstrap / route reactions).
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (signInErr) throw signInErr;

      // Transfer draft orders from anonymous user to the real user
      await claimAnonOrders(anonUserId);

      // Enrol this login on the current tenant if it hasn't shopped here before
      await ensureMembership();

      toast.success("Signed in!");
    } catch (err: any) {
      setError(err.message || "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <User className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold text-foreground">Account</h3>
        <span className="text-xs text-muted-foreground ml-1">— required to place your order</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          type="button"
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "register"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => { setTab("register"); setError(""); }}
        >
          New Account
        </button>
        <button
          type="button"
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            tab === "login"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => { setTab("login"); setError(""); }}
        >
          Sign In
        </button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Google OAuth */}
      <SocialAuthButtons tenantSlug={slug ?? null} />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or continue with email</span>
        </div>
      </div>

      {tab === "register" ? (
        <form onSubmit={handleRegister} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">First Name *</Label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Last Name</Label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
                disabled={loading}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+27 82 123 4567"
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Password *</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              disabled={loading}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Account…
              </>
            ) : (
              "Create Account & Continue"
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Password</Label>
            <Input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Your password"
              disabled={loading}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Signing In…
              </>
            ) : (
              "Sign In & Continue"
            )}
          </Button>
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={loading}
            className="w-full text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Forgot your password?
          </button>
        </form>

      )}
    </div>
  );
}
