import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { useTenantPaymentGateways, type GatewayProvider } from "@/hooks/usePaymentGateways";

interface Props {
  tenantId: string;
}

interface BranchRow {
  id: string;
  name: string;
  is_active: boolean;
}

interface BpgRow {
  branch_id: string;
  provider: GatewayProvider;
  mode: "test" | "live";
  credentials_secret_id: string | null;
}

/**
 * Tenant-admin overview of which branches are payment-ready for each
 * enabled provider. Purely a roll-up of branch_payment_gateways. No
 * secret values are read; we only check whether `credentials_secret_id`
 * is set and surface the persisted mode (sandbox / live).
 *
 * Tenant owners/admins already have RLS read access to both tables.
 */
export function BranchPaymentReadinessCard({ tenantId }: Props) {
  const tenantGwQ = useTenantPaymentGateways(tenantId);

  const branchesQ = useQuery({
    queryKey: ["readiness-branches", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, is_active")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as BranchRow[];
    },
  });

  const bpgQ = useQuery({
    queryKey: ["readiness-bpg", tenantId],
    enabled: !!tenantId && !!branchesQ.data?.length,
    queryFn: async () => {
      const ids = (branchesQ.data ?? []).map((b) => b.id);
      const { data, error } = await supabase
        .from("branch_payment_gateways")
        .select("branch_id, provider, mode, credentials_secret_id")
        .in("branch_id", ids);
      if (error) throw error;
      return (data ?? []) as BpgRow[];
    },
  });

  const enabledProviders = useMemo(
    () => (tenantGwQ.data ?? []).filter((g) => g.is_enabled).map((g) => g.provider),
    [tenantGwQ.data],
  );

  const bpgByBranch = useMemo(() => {
    const m = new Map<string, BpgRow[]>();
    for (const r of bpgQ.data ?? []) {
      const arr = m.get(r.branch_id) ?? [];
      arr.push(r);
      m.set(r.branch_id, arr);
    }
    return m;
  }, [bpgQ.data]);

  if (enabledProviders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Branch payment readiness</CardTitle>
          <CardDescription>Enable a provider above to see per-branch readiness.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const branches = branchesQ.data ?? [];
  const notReadyCount = branches.filter((b) => {
    const rows = bpgByBranch.get(b.id) ?? [];
    return !enabledProviders.every((p) => rows.find((r) => r.provider === p)?.credentials_secret_id);
  }).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Branch payment readiness</CardTitle>
        <CardDescription>
          Each branch needs its own merchant credentials. {notReadyCount === 0
            ? "All active branches are configured."
            : `${notReadyCount} of ${branches.length} active branches are missing credentials for at least one enabled provider.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {branchesQ.isLoading || bpgQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading branches…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-3 font-medium">Branch</th>
                  {enabledProviders.map((p) => (
                    <th key={p} className="py-2 pr-3 font-medium capitalize">{p}</th>
                  ))}
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {branches.map((b) => {
                  const rows = bpgByBranch.get(b.id) ?? [];
                  return (
                    <tr key={b.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3 font-medium">{b.name}</td>
                      {enabledProviders.map((p) => {
                        const r = rows.find((x) => x.provider === p);
                        const ok = !!r?.credentials_secret_id;
                        return (
                          <td key={p} className="py-2 pr-3">
                            {ok ? (
                              <Badge
                                variant="outline"
                                className={
                                  r!.mode === "live"
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 gap-1"
                                    : "bg-amber-50 text-amber-800 border-amber-300 gap-1"
                                }
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                {r!.mode === "live" ? "Live" : "Sandbox"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
                                <AlertTriangle className="h-3 w-3" />
                                Not configured
                              </Badge>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 pr-3 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/admin/branches/${b.id}`}>
                            Manage <ExternalLink className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {branches.length === 0 && (
                  <tr>
                    <td className="py-3 text-muted-foreground text-sm" colSpan={enabledProviders.length + 2}>
                      No active branches.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
