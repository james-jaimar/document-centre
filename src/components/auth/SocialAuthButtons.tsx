import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Provider = "google";

interface SocialAuthButtonsProps {
  /** Tenant slug from the storefront URL, if any. Determines callback path + membership scope. */
  tenantSlug?: string | null;
  /** Providers to render. Designed to extend (Apple, Microsoft) with no consumer changes. */
  providers?: Provider[];
}

const PROVIDER_META: Record<Provider, { label: string; icon: JSX.Element }> = {
  google: {
    label: "Continue with Google",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.1s2.69-6.1 6-6.1c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.83 3.36 14.66 2.4 12 2.4 6.92 2.4 2.8 6.52 2.8 11.6S6.92 20.8 12 20.8c6.92 0 9.2-4.86 9.2-7.4 0-.5-.05-.88-.12-1.2H12z"
        />
      </svg>
    ),
  },
};

export const SocialAuthButtons = ({
  tenantSlug,
  providers = ["google"],
}: SocialAuthButtonsProps) => {
  const { user } = useAuth();
  const [pending, setPending] = useState<Provider | null>(null);

  const signIn = async (provider: Provider) => {
    setPending(provider);
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      if (tenantSlug) callback.searchParams.set("tenant", tenantSlug);

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callback.toString(),
          queryParams: { access_type: "offline", prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start sign-in";
      toast.error(msg);
      setPending(null);
    }
  };

  return (
    <div className="space-y-2">
      {providers.map((p) => {
        const meta = PROVIDER_META[p];
        const isPending = pending === p;
        return (
          <Button
            key={p}
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => signIn(p)}
            disabled={!!pending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : meta.icon}
            {meta.label}
          </Button>
        );
      })}
    </div>
  );
};

export default SocialAuthButtons;
