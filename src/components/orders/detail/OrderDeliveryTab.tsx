import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { updateOrderAddress } from "@/lib/orders/mutations";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  addresses: any[];
  order?: any;
  editable?: boolean;
}

const FIELDS: Array<{ key: string; label: string; type?: string }> = [
  { key: "company_name", label: "Company" },
  { key: "contact_name", label: "Contact name" },
  { key: "line1", label: "Address line 1" },
  { key: "line2", label: "Address line 2" },
  { key: "suburb", label: "Suburb" },
  { key: "city", label: "City" },
  { key: "province", label: "Province" },
  { key: "postal_code", label: "Postal code" },
  { key: "country", label: "Country" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
];

export function OrderDeliveryTab({ addresses, order, editable = false }: Props) {
  const delivery = addresses.find((a: any) => a.address_type === "delivery");
  const billing = addresses.find((a: any) => a.address_type === "billing");
  const branch = order?.branch;
  const isCollection =
    order?.fulfillment_type === "collection" ||
    (!delivery && !!branch);

  const [editing, setEditing] = useState<"delivery" | "billing" | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const openEdit = (type: "delivery" | "billing", src: any) => {
    setEditing(type);
    const seed: Record<string, string> = {};
    FIELDS.forEach((f) => { seed[f.key] = src?.[f.key] ?? ""; });
    setDraft(seed);
    setInstructions(src?.instructions ?? "");
  };

  const save = async () => {
    if (!editing || !order?.id) return;
    setSaving(true);
    try {
      await updateOrderAddress({
        order_id: order.id,
        address_type: editing,
        address: { ...draft, instructions },
      });
      toast.success("Address updated");
      qc.invalidateQueries({ queryKey: ["order-detail", order.id] });
      setEditing(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const renderBranch = () => (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold text-sm text-primary mb-1">Collection from Store</h3>
      <p className="text-xs text-muted-foreground mb-3">Customer will collect this order in-store.</p>
      {branch ? (
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">{branch.name}</p>
          {branch.address && <p>{branch.address}</p>}
          {branch.city && <p>{branch.city}</p>}
          {(branch.postal_code || branch.province) && (
            <p>{[branch.postal_code, branch.province].filter(Boolean).join(" ")}</p>
          )}
          {branch.country && <p>{branch.country}</p>}
          {(branch.phone || branch.email) && (
            <div className="mt-3 pt-3 border-t space-y-0.5">
              <p className="font-semibold text-xs text-muted-foreground">Store Contact</p>
              {branch.phone && <p className="text-sm">{branch.phone}</p>}
              {branch.email && <p className="text-sm">{branch.email}</p>}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Branch details unavailable</p>
      )}
    </div>
  );

  const renderAddress = (addr: any, title: string, type: "delivery" | "billing") => (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-primary">{title}</h3>
        {editable && (
          <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(type, addr ?? {})}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>
      {!addr ? (
        <p className="text-xs text-muted-foreground">No address provided</p>
      ) : (
        <>
          <div className="space-y-0.5 text-sm">
            {addr.company_name && <p className="font-medium">{addr.company_name}</p>}
            {addr.contact_name && <p>{addr.contact_name}</p>}
            {addr.line1 && <p>{addr.line1}</p>}
            {addr.line2 && <p>{addr.line2}</p>}
            {addr.suburb && <p>{addr.suburb}</p>}
            {addr.city && <p>{addr.city}</p>}
            {(addr.postal_code || addr.province) && (
              <p>{[addr.postal_code, addr.province].filter(Boolean).join(" ")}</p>
            )}
            {addr.country && <p>{addr.country}</p>}
          </div>
          {(addr.phone || addr.email) && (
            <div className="mt-3 pt-3 border-t space-y-0.5">
              <p className="font-semibold text-xs text-muted-foreground">Contact Details</p>
              {addr.phone && <p className="text-sm">{addr.phone}</p>}
              {addr.email && <p className="text-sm">{addr.email}</p>}
            </div>
          )}
          {addr.instructions && (
            <div className="mt-3 pt-3 border-t">
              <p className="font-semibold text-xs text-muted-foreground">Instructions</p>
              <p className="text-sm">{addr.instructions}</p>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {isCollection ? renderBranch() : renderAddress(delivery, "Delivery Address", "delivery")}
      {renderAddress(billing, "Billing Address", "billing")}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit {editing} address</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.key === "line1" || f.key === "line2" ? "col-span-2" : ""}>
                <Label className="text-xs">{f.label}</Label>
                <Input
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                />
              </div>
            ))}
            <div className="col-span-2">
              <Label className="text-xs">Delivery instructions</Label>
              <Textarea rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save address"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
