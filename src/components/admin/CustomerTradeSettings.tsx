import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Props {
  customerProfileId: string;
  isTradeCustomer?: boolean | null;
  misAccountNumber?: string | null;
}

/**
 * Trade status + MIS account reference for a customer. Trade customers see the
 * trade column of pack pricing instead of the consumer price.
 */
export function CustomerTradeSettings({
  customerProfileId,
  isTradeCustomer,
  misAccountNumber,
}: Props) {
  const { tenantId, appId } = useTenantContext();
  const qc = useQueryClient();

  const [isTrade, setIsTrade] = useState(!!isTradeCustomer);
  const [accountNo, setAccountNo] = useState(misAccountNumber ?? "");

  useEffect(() => setIsTrade(!!isTradeCustomer), [isTradeCustomer]);
  useEffect(() => setAccountNo(misAccountNumber ?? ""), [misAccountNumber]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId || !appId) throw new Error("Missing tenant context");
      const { error } = await supabase
        .from("tenant_memberships")
        .update({
          is_trade_customer: isTrade,
          mis_account_number: accountNo.trim() || null,
        } as any)
        .eq("tenant_id", tenantId)
        .eq("app_id", appId)
        .eq("profile_id", customerProfileId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-customer", tenantId, customerProfileId] });
      qc.invalidateQueries({ queryKey: ["tenant-customers", tenantId] });
      qc.invalidateQueries({ queryKey: ["customer-pricing-tier"] });
      toast.success("Trade settings saved");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save trade settings"),
  });

  const dirty =
    isTrade !== !!isTradeCustomer || accountNo.trim() !== (misAccountNumber ?? "").trim();

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Trade account</h3>
        {isTradeCustomer && <Badge className="text-[11px]">Trade</Badge>}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label>Trade customer</Label>
          <p className="text-xs text-muted-foreground">
            Shows trade pricing instead of consumer pricing when signed in.
          </p>
        </div>
        <Switch checked={isTrade} onCheckedChange={setIsTrade} />
      </div>

      <div className="space-y-1 max-w-sm">
        <Label>MIS account number</Label>
        <Input
          value={accountNo}
          placeholder="e.g. IMP-01234"
          onChange={(e) => setAccountNo(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Matches the customer's account in your MIS system.
        </p>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Card>
  );
}
