import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCustomerAddresses, type CustomerAddress } from "@/hooks/useCustomerAddresses";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MapPin, Plus } from "lucide-react";
import { CustomerAddressDialog } from "@/components/admin/CustomerAddressDialog";

interface Props {
  /** Currently-entered address (free-form). Used to decide if a saved address is already chosen. */
  selectedId?: string | null;
  onSelect: (addr: CustomerAddress) => void;
  /** Filter to "delivery" or "both" by default */
  addressType?: "delivery" | "billing" | "any";
}

/**
 * Picker for the signed-in customer's saved addresses. Lists existing ones,
 * lets the user add a new one inline, and emits onSelect with the chosen row.
 */
export default function AddressPicker({ selectedId, onSelect, addressType = "delivery" }: Props) {
  const { user } = useAuth();
  const { data: addresses = [], isLoading } = useCustomerAddresses(user?.id);
  const [openDialog, setOpenDialog] = useState(false);

  const filtered = (addresses ?? []).filter((a) => {
    if (addressType === "any") return true;
    if (a.address_type === "both") return true;
    return a.address_type === addressType;
  });

  if (!user) return null;

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Loading saved addresses…</div>;
  }

  return (
    <div className="space-y-2">
      {filtered.length > 0 && (
        <RadioGroup
          value={selectedId ?? ""}
          onValueChange={(id) => {
            const m = filtered.find((a) => a.id === id);
            if (m) onSelect(m);
          }}
          className="space-y-2"
        >
          {filtered.map((a) => (
            <Label
              key={a.id}
              htmlFor={`addr-${a.id}`}
              className="flex items-start gap-3 rounded-md border p-3 hover:border-primary/40 cursor-pointer"
            >
              <RadioGroupItem value={a.id} id={`addr-${a.id}`} className="mt-1" />
              <div className="flex-1 text-xs">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-sm text-foreground">
                    {a.label || a.line1 || "Address"}
                  </span>
                  {a.is_default && (
                    <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px]">
                      Default
                    </span>
                  )}
                </div>
                {a.contact_name && <div>{a.contact_name}</div>}
                {a.line1 && <div className="text-muted-foreground">{a.line1}{a.line2 ? `, ${a.line2}` : ""}</div>}
                <div className="text-muted-foreground">
                  {[a.suburb, a.city, a.postal_code, a.province].filter(Boolean).join(", ")}
                </div>
              </div>
            </Label>
          ))}
        </RadioGroup>
      )}
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => setOpenDialog(true)}
        className="w-full"
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        {filtered.length === 0 ? "Add a saved address" : "Add another address"}
      </Button>

      <CustomerAddressDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        customerProfileId={user.id}
      />
    </div>
  );
}
