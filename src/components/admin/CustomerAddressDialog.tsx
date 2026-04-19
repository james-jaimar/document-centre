import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomerAddresses, type CustomerAddress, type CustomerAddressInput } from "@/hooks/useCustomerAddresses";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerProfileId: string;
  initial?: CustomerAddress | null;
}

const blank: CustomerAddressInput = {
  label: "",
  address_type: "delivery",
  is_default: false,
  contact_name: "",
  company_name: "",
  phone: "",
  email: "",
  line1: "",
  line2: "",
  suburb: "",
  city: "",
  province: "",
  postal_code: "",
  country: "South Africa",
  instructions: "",
};

export function CustomerAddressDialog({ open, onOpenChange, customerProfileId, initial }: Props) {
  const { create, update } = useCustomerAddresses(customerProfileId);
  const [form, setForm] = useState<CustomerAddressInput>(blank);

  useEffect(() => {
    if (open) {
      if (initial) {
        const { id, created_at, updated_at, tenant_id, app_id, customer_profile_id, ...rest } = initial as any;
        setForm(rest);
      } else {
        setForm(blank);
      }
    }
  }, [open, initial]);

  const handle = (k: keyof CustomerAddressInput, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    const cb = { onSuccess: () => onOpenChange(false) };
    if (initial) update.mutate({ id: initial.id, patch: form }, cb);
    else create.mutate(form, cb);
  };

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit address" : "Add address"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Label</Label>
            <Input placeholder="e.g. Head Office" value={form.label ?? ""} onChange={(e) => handle("label", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={form.address_type ?? "delivery"} onValueChange={(v) => handle("address_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="delivery">Delivery</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="both">Delivery & Billing</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Contact name</Label>
            <Input value={form.contact_name ?? ""} onChange={(e) => handle("contact_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Company</Label>
            <Input value={form.company_name ?? ""} onChange={(e) => handle("company_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input value={form.phone ?? ""} onChange={(e) => handle("phone", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={form.email ?? ""} onChange={(e) => handle("email", e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Address line 1</Label>
            <Input value={form.line1 ?? ""} onChange={(e) => handle("line1", e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Address line 2</Label>
            <Input value={form.line2 ?? ""} onChange={(e) => handle("line2", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Suburb</Label>
            <Input value={form.suburb ?? ""} onChange={(e) => handle("suburb", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>City</Label>
            <Input value={form.city ?? ""} onChange={(e) => handle("city", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Province</Label>
            <Input value={form.province ?? ""} onChange={(e) => handle("province", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Postal code</Label>
            <Input value={form.postal_code ?? ""} onChange={(e) => handle("postal_code", e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Country</Label>
            <Input value={form.country ?? ""} onChange={(e) => handle("country", e.target.value)} />
          </div>
          <div className="space-y-1 col-span-2">
            <Label>Delivery instructions</Label>
            <Textarea rows={2} value={form.instructions ?? ""} onChange={(e) => handle("instructions", e.target.value)} />
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Default for this type</div>
              <div className="text-xs text-muted-foreground">Used by default at checkout</div>
            </div>
            <Switch checked={!!form.is_default} onCheckedChange={(v) => handle("is_default", v)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>{pending ? "Saving…" : "Save address"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
