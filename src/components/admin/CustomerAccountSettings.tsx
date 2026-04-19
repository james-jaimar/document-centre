import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateCustomerAccount, type CustomerAccountSettings as Settings } from "@/hooks/useCustomerAccount";

interface Props {
  customerProfileId: string;
  initial: Settings;
}

export function CustomerAccountSettings({ customerProfileId, initial }: Props) {
  const update = useUpdateCustomerAccount(customerProfileId);
  const [form, setForm] = useState<Settings>(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const handle = (k: keyof Settings, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Account customer</h3>
          <p className="text-xs text-muted-foreground">Enable to allow ordering on credit terms.</p>
        </div>
        <Switch
          checked={!!form.is_account_customer}
          onCheckedChange={(v) => handle("is_account_customer", v)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>VAT number</Label>
          <Input value={form.vat_number ?? ""} onChange={(e) => handle("vat_number", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Default discount %</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={form.default_discount_pct ?? ""}
            onChange={(e) => handle("default_discount_pct", e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label>Credit limit (ZAR)</Label>
          <Input
            type="number"
            min={0}
            disabled={!form.is_account_customer}
            value={form.credit_limit ?? ""}
            onChange={(e) => handle("credit_limit", e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label>Payment terms (days)</Label>
          <Input
            type="number"
            min={0}
            disabled={!form.is_account_customer}
            value={form.payment_terms_days ?? ""}
            onChange={(e) => handle("payment_terms_days", e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>Internal notes</Label>
          <Textarea
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => handle("notes", e.target.value)}
            placeholder="Visible only to staff"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => update.mutate(form)} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </Card>
  );
}
