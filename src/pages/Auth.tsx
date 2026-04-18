import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, getDefaultRoute } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";

type AuthMode = "login" | "register" | "forgot";

const Auth = () => {
  const navigate = useNavigate();
  const { slug: tenantSlug } = useParams<{ slug: string }>();
  const { user, highestRole } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      if (tenantSlug && (!highestRole || highestRole === 'customer')) {
        navigate(`/t/${tenantSlug}/dashboard`, { replace: true });
      } else {
        navigate(getDefaultRoute(highestRole), { replace: true });
      }
    }
  }, [user, highestRole, navigate, tenantSlug]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError("Please enter both email and password");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) return setError("Please enter both email and password");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || email.split("@")[0],
            ...(tenantSlug ? { tenant_slug: tenantSlug } : {}),
          },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      toast.success("Check your email to confirm your account");
      setMode("login");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email) return setError("Please enter your email");
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset email sent");
      setMode("login");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitHandler =
    mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgotPassword;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[hsl(222,47%,11%)] to-[hsl(215,70%,25%)]">
      <div className="w-full max-w-md px-4">
        <Card className="shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Printer className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl font-bold">
              {mode === "login" ? "Welcome Back" : mode === "register" ? "Create Account" : "Reset Password"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Sign in to your print portal"
                : mode === "register"
                ? "Get started with your print account"
                : "Enter your email to reset your password"}
            </CardDescription>
          </CardHeader>

          <form onSubmit={submitHandler}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="displayName">Name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              {mode !== "forgot" && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
              )}

              <div className="relative pt-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <SocialAuthButtons tenantSlug={tenantSlug ?? null} />
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? "Please wait..."
                  : mode === "login"
                  ? "Sign In"
                  : mode === "register"
                  ? "Create Account"
                  : "Send Reset Link"}
              </Button>

              <div className="flex w-full flex-col gap-1 text-center text-sm text-muted-foreground">
                {mode === "login" && (
                  <>
                    <button type="button" className="hover:text-primary" onClick={() => setMode("forgot")}>
                      Forgot password?
                    </button>
                    <button type="button" className="hover:text-primary" onClick={() => setMode("register")}>
                      Don't have an account? <span className="font-medium text-primary">Sign up</span>
                    </button>
                  </>
                )}
                {mode !== "login" && (
                  <button type="button" className="hover:text-primary" onClick={() => setMode("login")}>
                    Back to sign in
                  </button>
                )}
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
