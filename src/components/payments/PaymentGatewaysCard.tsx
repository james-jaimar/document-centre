import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Globe, Lock, AlertTriangle, CheckCircle2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  useTenantPaymentGateways,
  useSavePaymentCredentials,
  useBranchPaymentGateways,
  useToggleTenantGatewayEnabled,
  useToggleBranchGatewayEnabled,
  usePaymentCredentialsSummary,
  type GatewayMode,
  type GatewayProvider,
  type TenantPaymentGateway,
} from "@/hooks/usePaymentGateways";

const SUPABASE_FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ALL_PROVIDERS: GatewayProvider[] = ["stripe", "payfast"];

interface Props {
  scope: "tenant" | "branch";
  scopeId: string;
  /** When scope=branch, also pass tenantId so we know which providers the tenant admin enabled. */
  tenantId?: string;
}

export function PaymentGatewaysCard({ scope, scopeId, tenantId }: Props) {
  const tenantQ = useTenantPaymentGateways(scope === "tenant" ? scopeId : tenantId);
  const branchQ = useBranchPaymentGateways(scope === "branch" ? scopeId : null);
  const toggleEnabled = useToggleTenantGatewayEnabled();

  if (tenantQ.isLoading) return <div className="text-muted-foreground text-sm">Loading…</div>;

  const tenantGws = tenantQ.data ?? [];
  const enabledTenantGws = tenantGws.filter((g) => g.is_enabled);

  const visibleProviders: GatewayProvider[] =
    scope === "tenant" ? ALL_PROVIDERS : enabledTenantGws.map((g) => g.provider);

  if (scope === "branch" && visibleProviders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Online payments</CardTitle>
          <CardDescription>
            No online payment providers have been enabled at the tenant level yet. Contact your tenant admin.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Online payments</CardTitle>
        <CardDescription>
          {scope === "tenant"
            ? "Enable providers and (optionally) set tenant-wide credentials. Branches can override with their own merchant accounts."
            : "Enter your branch's own merchant credentials. These are isolated from other branches."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {visibleProviders.map((provider) => {
          const tg = tenantGws.find((g) => g.provider === provider);
          const branchOverride = scope === "branch" ? branchQ.data?.find((b) => b.provider === provider) : undefined;
          const tenantHasCreds = !!tg?.credentials_secret_id;
          const branchHasCreds = !!branchOverride?.credentials_secret_id;
          const hasCreds = scope === "tenant" ? tenantHasCreds : branchHasCreds;
          const persistedMode: GatewayMode =
            scope === "branch"
              ? (branchOverride?.mode as GatewayMode | undefined) ?? tg?.mode ?? "test"
              : tg?.mode ?? "test";
          // Branch defaults to enabled when no row exists yet.
          const branchEnabled = branchOverride ? branchOverride.is_enabled !== false : true;
          return (
            <ProviderRow
              key={provider}
              provider={provider}
              scope={scope}
              scopeId={scopeId}
              tenantGateway={tg}
              isEnabledAtTenant={!!tg?.is_enabled}
              isEnabledAtBranch={branchEnabled}
              persistedMode={persistedMode}
              hasCreds={hasCreds}
              tenantHasCreds={tenantHasCreds}
              displayLabel={tg?.display_label ?? ""}
              onToggleEnabled={(next) => {
                if (!tenantId && scope !== "tenant") return;
                toggleEnabled.mutate(
                  { tenantId: scope === "tenant" ? scopeId : tenantId!, provider, isEnabled: next },
                  { onSuccess: () => toast.success(next ? `${provider} enabled` : `${provider} disabled`) }
                );
              }}
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

interface RowProps {
  provider: GatewayProvider;
  scope: "tenant" | "branch";
  scopeId: string;
  tenantGateway?: TenantPaymentGateway;
  isEnabledAtTenant: boolean;
  isEnabledAtBranch: boolean;
  persistedMode: GatewayMode;
  hasCreds: boolean;
  tenantHasCreds: boolean;
  displayLabel: string;
  onToggleEnabled: (next: boolean) => void;
}

function ProviderRow({
  provider, scope, scopeId, isEnabledAtTenant, isEnabledAtBranch, persistedMode, hasCreds, tenantHasCreds,
  displayLabel, onToggleEnabled,
}: RowProps) {
  const save = useSavePaymentCredentials();
  const toggleBranch = useToggleBranchGatewayEnabled();
  const summaryQ = usePaymentCredentialsSummary(scope, scopeId, provider, hasCreds);

  const [mode, setMode] = useState<GatewayMode>(persistedMode);
  const [label, setLabel] = useState(displayLabel);
  const [editing, setEditing] = useState(!hasCreds);
  // Stripe
  const [secretKey, setSecretKey] = useState("");
  const [pubKey, setPubKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  // PayFast
  const [merchantId, setMerchantId] = useState("");
  const [merchantKey, setMerchantKey] = useState("");
  const [passphrase, setPassphrase] = useState("");

  // Random suffix so password managers can't match the field across scopes.
  const nameSuffix = useMemo(() => `${provider}-${scopeId}-${Math.random().toString(36).slice(2, 8)}`, [provider, scopeId]);

  const handleSave = async (opts?: { modeOnly?: boolean }) => {
    try {
      await save.mutateAsync({
        scope,
        scope_id: scopeId,
        provider,
        mode,
        display_label: scope === "tenant" ? label || undefined : undefined,
        secret_key: opts?.modeOnly ? undefined : (secretKey || undefined),
        publishable_key: opts?.modeOnly ? undefined : (pubKey || undefined),
        webhook_secret: opts?.modeOnly ? undefined : (webhookSecret || undefined),
        merchant_id: opts?.modeOnly ? undefined : (merchantId || undefined),
        merchant_key: opts?.modeOnly ? undefined : (merchantKey || undefined),
        passphrase: opts?.modeOnly ? undefined : (passphrase || undefined),
      });
      toast.success(opts?.modeOnly ? "Mode updated" : "Credentials saved");
      setSecretKey(""); setPubKey(""); setWebhookSecret("");
      setMerchantId(""); setMerchantKey(""); setPassphrase("");
      if (!opts?.modeOnly && hasCreds) setEditing(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    }
  };

  const webhookUrl = `${SUPABASE_FUNCTIONS_BASE}/${provider === "stripe" ? "stripe-order-webhook" : "payfast-itn"}`;
  const disabledAtTenant = scope === "tenant" && !isEnabledAtTenant;
  const modeChanged = mode !== persistedMode;
  const summary = summaryQ.data;

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${disabledAtTenant ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <CreditCard className="h-4 w-4" />
          <span className="font-medium capitalize">{provider}</span>
          {hasCreds ? (
            <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" />Credentials saved</Badge>
          ) : (
            <Badge variant="outline">Not configured</Badge>
          )}
          {hasCreds && (scope === "tenant" || isEnabledAtTenant) && persistedMode === "live" && (
            provider === "payfast" && summary?.payfast && !summary.payfast.has_passphrase ? (
              <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
                <AlertTriangle className="h-3 w-3" />
                Passphrase missing — payments will fail
              </Badge>
            ) : (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100">
                Live — accepting payments
              </Badge>
            )
          )}
          {hasCreds && (scope === "tenant" || isEnabledAtTenant) && persistedMode === "test" && (
            <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
              Sandbox — test mode
            </Badge>
          )}
          {hasCreds && scope === "branch" && !isEnabledAtTenant && (
            <Badge variant="outline" className="text-muted-foreground">
              Disabled at tenant level
            </Badge>
          )}
          {scope === "branch" && !tenantHasCreds && !hasCreds && (
            <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
              <AlertTriangle className="h-3 w-3" />
              Add your merchant credentials to accept this method
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {scope === "tenant" && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Enabled</Label>
              <Switch checked={isEnabledAtTenant} onCheckedChange={onToggleEnabled} />
            </div>
          )}
          <Select value={mode} onValueChange={(v) => setMode(v as GatewayMode)} disabled={disabledAtTenant}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="test">Sandbox</SelectItem>
              <SelectItem value="live">Live</SelectItem>
            </SelectContent>
          </Select>
          {modeChanged && hasCreds && (
            <Button size="sm" variant="outline" onClick={() => handleSave({ modeOnly: true })} disabled={save.isPending}>
              Save mode
            </Button>
          )}
        </div>
      </div>

      {disabledAtTenant ? (
        <p className="text-xs text-muted-foreground">
          Toggle on to enable this provider for your tenant. Credentials can be set tenant-wide here, or per-branch from each branch's settings.
        </p>
      ) : (
        <>
          {/* Saved credentials summary */}
          {hasCreds && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Currently saved
                </div>
                {!editing && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                    <Pencil className="h-3 w-3 mr-1" /> Replace credentials
                  </Button>
                )}
              </div>
              {summaryQ.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
              {summary?.payfast && provider === "payfast" && (
                <>
                  <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <SummaryField label="Merchant ID" value={summary.payfast.merchant_id ?? "— not set"} mono />
                    <SummaryField label="Merchant Key" value={summary.payfast.merchant_key_mask ?? "— not set"} mono />
                    <SummaryField label="Passphrase" value={summary.payfast.has_passphrase ? "•••••• saved" : "— not set"} />
                  </dl>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    The passphrase here must match the one set in your PayFast dashboard (Settings → Integration) exactly. If PayFast has a passphrase set, this branch must too — and vice versa. A mismatch causes "Generated signature does not match submitted signature" at checkout.
                  </p>
                </>
              )}
              {summary?.stripe && provider === "stripe" && (
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <SummaryField label="Publishable key" value={summary.stripe.publishable_key ?? "— not set"} mono />
                  <SummaryField label="Secret key" value={summary.stripe.secret_key_mask ?? "— not set"} mono />
                  <SummaryField label="Webhook secret" value={summary.stripe.webhook_secret_mask ?? "— not set"} mono />
                </dl>
              )}
            </div>
          )}

          {scope === "tenant" && (
            <div className="space-y-1">
              <Label className="text-xs">Display label (shown at checkout)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={provider === "stripe" ? "Pay by Card" : "PayFast"} />
            </div>
          )}

          {editing && (
            <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-3">
              {/* Autofill trap — Chrome/Safari dump guesses here instead of the real fields */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
                <input type="text" name="username" tabIndex={-1} autoComplete="username" />
                <input type="password" name="password" tabIndex={-1} autoComplete="current-password" />
              </div>

              {provider === "stripe" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Secret key (sk_…)</Label>
                    <Input
                      type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore
                      name={`sk-${nameSuffix}`}
                      value={secretKey} onChange={(e) => setSecretKey(e.target.value)}
                      placeholder={hasCreds ? "•••••• (leave blank to keep)" : "sk_test_…"}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Publishable key</Label>
                    <Input
                      autoComplete="off" data-lpignore="true" data-1p-ignore
                      name={`pk-${nameSuffix}`}
                      value={pubKey} onChange={(e) => setPubKey(e.target.value)}
                      placeholder={hasCreds ? "••••••" : "pk_test_…"}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Webhook signing secret</Label>
                    <Input
                      type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore
                      name={`wh-${nameSuffix}`}
                      value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder={hasCreds ? "•••••• (leave blank to keep)" : "whsec_…"}
                    />
                  </div>
                  <div className="md:col-span-2 text-xs text-muted-foreground">
                    Webhook URL to paste in Stripe dashboard: <code className="font-mono">{webhookUrl}</code>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Merchant ID</Label>
                    <Input
                      autoComplete="off" data-lpignore="true" data-1p-ignore
                      name={`pf-mid-${nameSuffix}`}
                      value={merchantId} onChange={(e) => setMerchantId(e.target.value)}
                      placeholder={hasCreds ? "(leave blank to keep)" : "10000100"}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Merchant Key</Label>
                    <Input
                      type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore
                      name={`pf-mkey-${nameSuffix}`}
                      value={merchantKey} onChange={(e) => setMerchantKey(e.target.value)}
                      placeholder={hasCreds ? "•••••• (leave blank to keep)" : "46f0cd694581a"}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label className="text-xs">Passphrase (optional but recommended)</Label>
                    <Input
                      type="password" autoComplete="new-password" data-lpignore="true" data-1p-ignore
                      name={`pf-pp-${nameSuffix}`}
                      value={passphrase} onChange={(e) => setPassphrase(e.target.value)}
                      placeholder={hasCreds ? "•••••• (leave blank to keep)" : ""}
                    />
                  </div>
                  <div className="md:col-span-2 text-xs text-muted-foreground">
                    ITN URL to paste in PayFast settings: <code className="font-mono">{webhookUrl}</code>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                {hasCreds && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => {
                    setEditing(false);
                    setSecretKey(""); setPubKey(""); setWebhookSecret("");
                    setMerchantId(""); setMerchantKey(""); setPassphrase("");
                  }}>
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                )}
                <Button type="submit" size="sm" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save credentials"}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function SummaryField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono break-all" : ""}>{value}</dd>
    </div>
  );
}
