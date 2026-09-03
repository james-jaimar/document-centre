import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Building2, Loader2 } from "lucide-react";
import { CompanyUsersPanel } from "@/components/customers/CompanyUsersPanel";
import {
  useSaveCustomerCompany,
  type CustomerCompany,
} from "@/hooks/useCustomerCompanies";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  company?: CustomerCompany | null;
  /** Branch to attach a newly created company to (branch admin). */
  branchId?: string | null;
  onSaved?: (company: CustomerCompany) => void;
}

type FormState = {
  name: string;
  trading_name: string;
  registration_number: string;
  vat_number: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  billing_line1: string;
  billing_line2: string;
  billing_suburb: string;
  billing_city: string;
  billing_province: string;
  billing_postal_code: string;
  billing_country: string;
  delivery_same_as_billing: boolean;
  delivery_line1: string;
  delivery_line2: string;
  delivery_suburb: string;
  delivery_city: string;
  delivery_province: string;
  delivery_postal_code: string;
  delivery_country: string;
  is_trade_customer: boolean;
  mis_account_number: string;
  credit_limit: string;
  payment_terms_days: string;
  default_discount_pct: string;
  notes: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  name: "", trading_name: "", registration_number: "", vat_number: "",
  email: "", phone: "", website: "", industry: "",
  billing_line1: "", billing_line2: "", billing_suburb: "", billing_city: "",
  billing_province: "", billing_postal_code: "", billing_country: "South Africa",
  delivery_same_as_billing: true,
  delivery_line1: "", delivery_line2: "", delivery_suburb: "", delivery_city: "",
  delivery_province: "", delivery_postal_code: "", delivery_country: "",
  is_trade_customer: false, mis_account_number: "",
  credit_limit: "0", payment_terms_days: "30", default_discount_pct: "0",
  notes: "", is_active: true,
};

function fromCompany(c: CustomerCompany): FormState {
  return {
    name: c.name ?? "",
    trading_name: c.trading_name ?? "",
    registration_number: c.registration_number ?? "",
    vat_number: c.vat_number ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    website: c.website ?? "",
    industry: c.industry ?? "",
    billing_line1: c.billing_line1 ?? "",
    billing_line2: c.billing_line2 ?? "",
    billing_suburb: c.billing_suburb ?? "",
    billing_city: c.billing_city ?? "",
    billing_province: c.billing_province ?? "",
    billing_postal_code: c.billing_postal_code ?? "",
    billing_country: c.billing_country ?? "",
    delivery_same_as_billing: c.delivery_same_as_billing !== false,
    delivery_line1: c.delivery_line1 ?? "",
    delivery_line2: c.delivery_line2 ?? "",
    delivery_suburb: c.delivery_suburb ?? "",
    delivery_city: c.delivery_city ?? "",
    delivery_province: c.delivery_province ?? "",
    delivery_postal_code: c.delivery_postal_code ?? "",
    delivery_country: c.delivery_country ?? "",
    is_trade_customer: !!c.is_trade_customer,
    mis_account_number: c.mis_account_number ?? "",
    credit_limit: String(c.credit_limit ?? 0),
    payment_terms_days: String(c.payment_terms_days ?? 30),
    default_discount_pct: String(c.default_discount_pct ?? 0),
    notes: c.notes ?? "",
    is_active: c.is_active !== false,
  };
}

export function CompanyFormDialog({ open, onOpenChange, company, branchId, onSaved }: Props) {
  const save = useSaveCustomerCompany();
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm(company ? fromCompany(company) : EMPTY);
  }, [open, company]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    if (!form.name.trim()) return;
    const trimmed = (v: string) => (v.trim() ? v.trim() : null);
    save.mutate(
      {
        id: company?.id,
        name: form.name.trim(),
        trading_name: trimmed(form.trading_name),
        registration_number: trimmed(form.registration_number),
        vat_number: trimmed(form.vat_number),
        email: trimmed(form.email),
        phone: trimmed(form.phone),
        website: trimmed(form.website),
        industry: trimmed(form.industry),
        billing_line1: trimmed(form.billing_line1),
        billing_line2: trimmed(form.billing_line2),
        billing_suburb: trimmed(form.billing_suburb),
        billing_city: trimmed(form.billing_city),
        billing_province: trimmed(form.billing_province),
        billing_postal_code: trimmed(form.billing_postal_code),
        billing_country: trimmed(form.billing_country),
        delivery_same_as_billing: form.delivery_same_as_billing,
        delivery_line1: trimmed(form.delivery_line1),
        delivery_line2: trimmed(form.delivery_line2),
        delivery_suburb: trimmed(form.delivery_suburb),
        delivery_city: trimmed(form.delivery_city),
        delivery_province: trimmed(form.delivery_province),
        delivery_postal_code: trimmed(form.delivery_postal_code),
        delivery_country: trimmed(form.delivery_country),
        is_trade_customer: form.is_trade_customer,
        mis_account_number: trimmed(form.mis_account_number),
        credit_limit: Number(form.credit_limit) || 0,
        payment_terms_days: Number(form.payment_terms_days) || 0,
        default_discount_pct: Number(form.default_discount_pct) || 0,
        notes: trimmed(form.notes),
        is_active: form.is_active,
        ...(company ? {} : { branch_id: branchId ?? null }),
      },
      {
        onSuccess: (row) => {
          onSaved?.(row);
          onOpenChange(false);
        },
      },
    );
  };

  const field = (
    key: keyof FormState,
    label: string,
    props: { type?: string; placeholder?: string } = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`co-${String(key)}`}>{label}</Label>
      <Input
        id={`co-${String(key)}`}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!save.isPending) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {company ? "Edit company" : "New company"}
          </DialogTitle>
          <DialogDescription>
            Full business profile. Account terms set here apply to every user linked to this company.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[62vh] px-6">
          <div className="space-y-6 pb-6">
            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Business details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("name", "Company name *")}
                {field("trading_name", "Trading as")}
                {field("registration_number", "Company reg. no.")}
                {field("vat_number", "VAT number")}
                {field("industry", "Industry")}
                {field("website", "Website", { placeholder: "https://" })}
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Main contact details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("email", "Company email", { type: "email" })}
                {field("phone", "Company phone")}
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Billing address</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {field("billing_line1", "Address line 1")}
                {field("billing_line2", "Address line 2")}
                {field("billing_suburb", "Suburb")}
                {field("billing_city", "City")}
                {field("billing_province", "Province / State")}
                {field("billing_postal_code", "Postal code")}
                {field("billing_country", "Country")}
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Delivery address</h3>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  Same as billing
                  <Switch
                    checked={form.delivery_same_as_billing}
                    onCheckedChange={(v) => set("delivery_same_as_billing", v)}
                  />
                </label>
              </div>
              {!form.delivery_same_as_billing && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {field("delivery_line1", "Address line 1")}
                  {field("delivery_line2", "Address line 2")}
                  {field("delivery_suburb", "Suburb")}
                  {field("delivery_city", "City")}
                  {field("delivery_province", "Province / State")}
                  {field("delivery_postal_code", "Postal code")}
                  {field("delivery_country", "Country")}
                </div>
              )}
            </section>

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Account & pricing</h3>
              <div className="rounded-lg border p-4 space-y-4">
                <label className="flex items-center justify-between gap-4 text-sm">
                  <span>
                    <span className="font-medium">Trade customer</span>
                    <span className="block text-xs text-muted-foreground">
                      All users linked to this company see trade pack prices.
                    </span>
                  </span>
                  <Switch
                    checked={form.is_trade_customer}
                    onCheckedChange={(v) => set("is_trade_customer", v)}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field("mis_account_number", "Account number (MIS)", { placeholder: "e.g. IMP0421" })}
                  {field("credit_limit", "Credit limit", { type: "number" })}
                  {field("payment_terms_days", "Payment terms (days)", { type: "number" })}
                  {field("default_discount_pct", "Default discount %", { type: "number" })}
                </div>
              </div>
            </section>

            <Separator />

            <Separator />

            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Users</h3>
              {company?.id ? (
                <CompanyUsersPanel companyId={company.id} companyName={company.name} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Save the company first — you can then add or link users here.
                </p>
              )}
            </section>

            <Separator />

            <section className="space-y-3">
              <Label htmlFor="co-notes">Internal notes</Label>
              <Textarea
                id="co-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
                Active
              </label>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending || !form.name.trim()}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {company ? "Save changes" : "Create company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
