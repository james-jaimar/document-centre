import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Globe } from "lucide-react";
import {
  useTenantPaymentGateways,
  useToggleTenantGatewayEnabled,
  type GatewayProvider,
} from "@/hooks/usePaymentGateways";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  tenantName: string;
}

const PROVIDERS: { provider: GatewayProvider; label: string; helper: string }[] = [
  { provider: "stripe", label: "Stripe", helper: "International cards (any currency). Tenant supplies their own Stripe keys." },
  { provider: "payfast", label: "PayFast", helper: "South African gateway (ZAR only). Tenant or branch supplies merchant credentials." },
];

export function PlatformTenantPaymentsDialog({ open, onOpenChange, tenantId, tenantName }: Props) {
  const { data: gateways = [], isLoading } = useTenantPaymentGateways(tenantId);
  const toggle = useToggleTenantGatewayEnabled();

  const isEnabled = (p: GatewayProvider) => gateways.find((g) => g.provider === p)?.is_enabled ?? false;

  const handleToggle = async (p: GatewayProvider, v: boolean) => {
    try {
      await toggle.mutateAsync({ tenantId, provider: p, isEnabled: v });
      toast.success(`${p} ${v ? "enabled" : "disabled"} for ${tenantName}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Payment gateways — {tenantName}
          </DialogTitle>
          <DialogDescription>
            Enable the providers this tenant is permitted to use. They will then add their own credentials inside their admin portal.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-3">
            {PROVIDERS.map((p) => {
              const enabled = isEnabled(p.provider);
              const row = gateways.find((g) => g.provider === p.provider);
              return (
                <div key={p.provider} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      <Label className="text-sm font-medium">{p.label}</Label>
                      {row?.credentials_secret_id ? (
                        <Badge variant="secondary" className="text-[10px]">Credentials saved</Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{p.helper}</p>
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={toggle.isPending}
                    onCheckedChange={(v) => handleToggle(p.provider, v)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
