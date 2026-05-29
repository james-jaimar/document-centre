import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Globe, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  useTenantPaymentGateways,
  useSavePaymentCredentials,
  useBranchPaymentGateways,
  useToggleTenantGatewayEnabled,
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

  // Tenant scope: show ALL providers (enabled + not-yet-enabled) so the tenant admin can toggle.
  // Branch scope: show ONLY tenant-enabled providers so branch managers see what's available to configure.
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
          return (
            <ProviderRow
              key={provider}
              provider={provider}
              scope={scope}
              scopeId={scopeId}
              tenantGateway={tg}
              isEnabledAtTenant={!!tg?.is_enabled}
              currentMode={(branchOverride?.mode as GatewayMode | undefined) ?? tg?.mode ?? "test"}
              hasCreds={scope === "tenant" ? tenantHasCreds : branchHasCreds}
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
  currentMode: GatewayMode;
  hasCreds: boolean;
  tenantHasCreds: boolean;
  displayLabel: string;
  onToggleEnabled: (next: boolean) => void;
}

function ProviderRow({
  provider, scope, scopeId, isEnabledAtTenant, currentMode, hasCreds, tenantHasCreds,
  displayLabel, onToggleEnabled,
}: RowProps) {
  const save = useSavePaymentCredentials();
  const [mode, setMode] = useState<GatewayMode>(currentMode);
  const [label, setLabel] = useState(displayLabel);
  // Stripe
  const [secretKey, setSecretKey] = useState("");
  const [pubKey, setPubKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  // PayFast
  const [merchantId, setMerchantId] = useState("");
  const [merchantKey, setMerchantKey] = useState("");
  const [passphrase, setPassphrase] = useState("");

  const handleSave = async () => {
    try {
      await save.mutateAsync({
        scope,
        scope_id: scopeId,
        provider,
        mode,
        display_label: scope === "tenant" ? label || undefined : undefined,
        secret_key: secretKey || undefined,
        publishable_key: pubKey || undefined,
        webhook_secret: webhookSecret || undefined,
        merchant_id: merchantId || undefined,
        merchant_key: merchantKey || undefined,
        passphrase: passphrase || undefined,
      });
      toast.success("Credentials saved");
      setSecretKey(""); setPubKey(""); setWebhookSecret("");
      setMerchantId(""); setMerchantKey(""); setPassphrase("");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    }
  };

  const webhookUrl = `${SUPABASE_FUNCTIONS_BASE}/${provider === "stripe" ? "stripe-order-webhook" : "payfast-itn"}`;
  const disabledAtTenant = scope === "tenant" && !isEnabledAtTenant;

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${disabledAtTenant ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          <span className="font-medium capitalize">{provider}</span>
          {hasCreds ? (
            <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" />Credentials saved</Badge>
          ) : (
            <Badge variant="outline">Not configured</Badge>
          )}
          {scope === "branch" && !tenantHasCreds && (
            <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
              <AlertTriangle className="h-3 w-3" />
              Branch credentials required
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
        </div>
      </div>

      {disabledAtTenant ? (
        <p className="text-xs text-muted-foreground">
          Toggle on to enable this provider for your tenant. Credentials can be set tenant-wide here, or per-branch from each branch's settings.
        </p>
      ) : (
        <>
          {scope === "tenant" && (
            <div className="space-y-1">
              <Label className="text-xs">Display label (shown at checkout)</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={provider === "stripe" ? "Pay by Card" : "PayFast"} />
            </div>
          )}

          {provider === "stripe" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Secret key (sk_…)</Label>
                <Input type="password" autoComplete="off" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder={hasCreds ? "•••••• (leave blank to keep)" : "sk_test_…"} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Publishable key</Label>
                <Input value={pubKey} onChange={(e) => setPubKey(e.target.value)} placeholder={hasCreds ? "••••••" : "pk_test_…"} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Webhook signing secret</Label>
                <Input type="password" autoComplete="off" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={hasCreds ? "•••••• (leave blank to keep)" : "whsec_…"} />
              </div>
              <div className="md:col-span-2 text-xs text-muted-foreground">
                Webhook URL to paste in Stripe dashboard: <code className="font-mono">{webhookUrl}</code>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Merchant ID</Label>
                <Input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder={hasCreds ? "••••••" : "10000100"} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Merchant Key</Label>
                <Input type="password" autoComplete="off" value={merchantKey} onChange={(e) => setMerchantKey(e.target.value)} placeholder={hasCreds ? "•••••• (leave blank to keep)" : "46f0cd694581a"} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Passphrase (optional but recommended)</Label>
                <Input type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder={hasCreds ? "•••••• (leave blank to keep)" : ""} />
              </div>
              <div className="md:col-span-2 text-xs text-muted-foreground">
                ITN URL to paste in PayFast settings: <code className="font-mono">{webhookUrl}</code>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save credentials"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
