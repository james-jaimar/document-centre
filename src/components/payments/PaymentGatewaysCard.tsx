import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  useTenantPaymentGateways,
  useSavePaymentCredentials,
  useBranchPaymentGateways,
  type GatewayMode,
  type GatewayProvider,
} from "@/hooks/usePaymentGateways";

const SUPABASE_FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

interface Props {
  scope: "tenant" | "branch";
  scopeId: string;
  /** When scope=branch, also pass tenantId so we know which providers the platform admin enabled. */
  tenantId?: string;
}

export function PaymentGatewaysCard({ scope, scopeId, tenantId }: Props) {
  const tenantQ = useTenantPaymentGateways(scope === "tenant" ? scopeId : tenantId);
  const branchQ = useBranchPaymentGateways(scope === "branch" ? scopeId : null);
  const enabledTenantGws = (tenantQ.data ?? []).filter((g) => g.is_enabled);

  if (tenantQ.isLoading) return <div className="text-muted-foreground text-sm">Loading…</div>;

  if (enabledTenantGws.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> Online payments</CardTitle>
          <CardDescription>No online payment providers have been enabled by the platform yet. Contact support to enable Stripe or PayFast.</CardDescription>
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
            ? "Enter the credentials your customers' payments will be routed to."
            : "Override your tenant's credentials with this branch's own merchant account (optional)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {enabledTenantGws.map((tg) => {
          const branchOverride = scope === "branch" ? branchQ.data?.find((b) => b.provider === tg.provider) : undefined;
          return (
            <ProviderRow
              key={tg.provider}
              provider={tg.provider}
              scope={scope}
              scopeId={scopeId}
              currentMode={(branchOverride?.mode as GatewayMode | undefined) ?? tg.mode}
              hasCreds={scope === "tenant" ? !!tg.credentials_secret_id : !!branchOverride?.credentials_secret_id}
              displayLabel={tg.display_label ?? ""}
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
  currentMode: GatewayMode;
  hasCreds: boolean;
  displayLabel: string;
}

function ProviderRow({ provider, scope, scopeId, currentMode, hasCreds, displayLabel }: RowProps) {
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

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          <span className="font-medium capitalize">{provider}</span>
          {hasCreds ? (
            <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" />Credentials saved</Badge>
          ) : (
            <Badge variant="outline">Not configured</Badge>
          )}
        </div>
        <Select value={mode} onValueChange={(v) => setMode(v as GatewayMode)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="test">Sandbox</SelectItem>
            <SelectItem value="live">Live</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
        <Button size="sm" onClick={handleSave} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
