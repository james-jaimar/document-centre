/**
 * Shared "Log in as customer" pieces for the tenant admin area.
 *
 * The heavy lifting (minting the customer session, the amber banner, the
 * audit trail, the idle timeout) already lives in ImpersonationContext —
 * this only resolves where the new tab should land and shows a short
 * confirmation so the behaviour matches across every admin screen.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { buildTenantPath } from "@/lib/tenantUrl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Resolves the storefront path for the current tenant (and branch, if set). */
export function useStorefrontPath(branchIdOverride?: string | null) {
  const { tenantId, branchId } = useTenantContext();
  const effectiveBranchId = branchIdOverride ?? branchId ?? null;

  const { data } = useQuery({
    queryKey: ["impersonate-storefront-path", tenantId, effectiveBranchId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("slug")
        .eq("id", tenantId!)
        .maybeSingle();

      let branchSlug: string | null = null;
      if (effectiveBranchId) {
        const { data: branch } = await supabase
          .from("branches")
          .select("slug, url_slug")
          .eq("id", effectiveBranchId)
          .maybeSingle();
        branchSlug = branch ? (branch.url_slug || branch.slug) : null;
      }
      return { slug: (tenant?.slug as string | null) ?? null, branchSlug };
    },
  });

  return (rest: string = "/") =>
    data?.slug ? buildTenantPath(data.slug, data.branchSlug, rest) : null;
}

interface DialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileId: string;
  email?: string | null;
  name?: string | null;
  /** Branch to land in — falls back to the branch in context. */
  branchId?: string | null;
  /** Path inside the storefront, e.g. "/orders/123". Defaults to the home page. */
  rest?: string;
}

export function ImpersonateCustomerDialog({
  open, onOpenChange, profileId, email, name, branchId, rest = "/",
}: DialogProps) {
  const { tenantId, branchId: ctxBranchId } = useTenantContext();
  const { startImpersonation } = useImpersonation();
  const buildPath = useStorefrontPath(branchId);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!tenantId) return;
    const path = buildPath(rest);
    if (!path) {
      toast.error("Couldn't work out this tenant's storefront address.");
      return;
    }
    setBusy(true);
    try {
      await startImpersonation({
        target_profile_id: profileId,
        tenant_id: tenantId,
        branch_id: branchId ?? ctxBranchId ?? null,
        return_to: window.location.pathname + window.location.search,
        redirect_to: path,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not log in as customer");
    } finally {
      setBusy(false);
    }
  };

  const who = name || email || "this customer";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Log in as {who}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                We'll open a new tab signed in as {email ? <strong>{email}</strong> : "this customer"},
                so you can browse, build orders and fill their basket for them.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Anything you do is recorded as being done by the customer, and the session is audited.</li>
                <li>No emails are sent to the customer for actions you take.</li>
                <li>Online card payments are disabled while you're viewing as them.</li>
                <li>The session ends automatically after 30 minutes of inactivity.</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); go(); }}>
            {busy ? "Opening…" : "Log in as customer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface ButtonProps {
  profileId: string;
  email?: string | null;
  name?: string | null;
  branchId?: string | null;
  rest?: string;
  label?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "secondary";
}

export function ImpersonateCustomerButton({
  profileId, email, name, branchId, rest, label = "Log in as customer",
  size = "sm", variant = "outline",
}: ButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} disabled={!email} onClick={() => setOpen(true)}>
        <LogIn className="h-4 w-4 mr-1" /> {label}
      </Button>
      <ImpersonateCustomerDialog
        open={open}
        onOpenChange={setOpen}
        profileId={profileId}
        email={email}
        name={name}
        branchId={branchId}
        rest={rest}
      />
    </>
  );
}
