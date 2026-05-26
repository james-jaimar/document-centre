import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCart, usePlaceOrder } from "@/hooks/useCart";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useBranch, branchUrlSlug } from "@/contexts/BranchContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, MapPin, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { formatPrice } from "@/lib/formatCurrency";
import CheckoutAuth from "@/components/checkout/CheckoutAuth";

export default function Checkout() {
  const { slug, tenantPath } = useTenantSlug();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: cart, isLoading } = useCart();
  const { tenantId } = useTenantContext();
  const { activeBranch, branches: liveBranches } = useBranch();
  const { isSubdomain } = useTenantSlug();
  const placeOrder = usePlaceOrder();
  const { region } = useRegionalPricing();
  // Currency is locked at the cart level (set when items are added). Fall back
  // to the active region for empty-cart edge cases.
  const currency = ((cart as { currency?: string } | null)?.currency) ?? region?.currency_code ?? "ZAR";

  const [deliveryMethod, setDeliveryMethod] = useState<"collection" | "delivery">("collection");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("offline");
  const [showBranchSwitch, setShowBranchSwitch] = useState(false);

  // Fetch online payment providers enabled for this tenant
  const { data: onlineProviders } = useQuery({
    queryKey: ["tenant-online-payment-providers", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_payment_gateways")
        .select("provider, display_label, mode, is_enabled, credentials_secret_id")
        .eq("tenant_id", tenantId!)
        .eq("is_enabled", true);
      if (error) throw error;
      // Only show providers with credentials configured AND compatible currency
      return (data ?? []).filter((g) => {
        if (!g.credentials_secret_id) return false;
        if (g.provider === "payfast" && currency !== "ZAR") return false;
        return true;
      });
    },
  });

  // The collection branch is locked to the active storefront branch. Pricing,
  // stock and customer accounts are all scoped per-branch, so switching
  // branches means re-entering the other branch's storefront.
  const collectionBranch = activeBranch;

  // Delivery address fields
  const [address, setAddress] = useState({
    contact_name: "",
    company_name: "",
    line1: "",
    line2: "",
    city: "",
    province: "",
    postal_code: "",
    phone: "",
    email: "",
  });

  const items = (cart?.order_items as any[]) ?? [];
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.unit_price) * item.quantity,
    0
  );
  // Demo mode: no VAT/tax line. Tenants will configure their own tax rules later.
  const total = subtotal;

  const handlePlaceOrder = async () => {
    if (!cart) return;
    if (deliveryMethod === "collection" && branches && branches.length > 1 && !selectedBranchId) {
      toast.error("Please select a collection branch");
      return;
    }
    if (deliveryMethod === "delivery" && !address.line1.trim()) {
      toast.error("Please enter a delivery address");
      return;
    }

    setIsSubmitting(true);
    try {
      const newOrderId = await placeOrder.mutateAsync({
        cartOrderId: cart.id,
        deliveryMethod,
        notes: notes.trim() || undefined,
        deliveryAddress: deliveryMethod === "delivery" ? address : undefined,
        branchId: deliveryMethod === "collection"
          ? (selectedBranchId || branches?.[0]?.id || undefined)
          : undefined,
      });

      // Online payment selected — create payment session and redirect
      if (paymentMethod === "stripe" || paymentMethod === "payfast") {
        const origin = window.location.origin;
        const returnUrl = `${origin}${tenantPath(`orders/${newOrderId}/confirmation`)}`;
        const cancelUrl = `${origin}${tenantPath("checkout")}?payment=cancelled`;
        const { data, error } = await supabase.functions.invoke("payments-create-session", {
          body: {
            order_id: newOrderId,
            provider: paymentMethod,
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        });
        if (error) throw error;
        if (paymentMethod === "stripe" && data?.redirect_url) {
          window.location.href = data.redirect_url;
          return;
        }
        if (paymentMethod === "payfast" && data?.form_action && data?.form_fields) {
          // Build & auto-submit a hidden form
          const form = document.createElement("form");
          form.method = "POST";
          form.action = data.form_action;
          Object.entries(data.form_fields as Record<string, string>).forEach(([k, v]) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = k;
            input.value = v;
            form.appendChild(input);
          });
          document.body.appendChild(form);
          form.submit();
          return;
        }
        throw new Error("Payment session response was empty");
      }

      navigate(tenantPath(`orders/${newOrderId}/confirmation`));
    } catch (err: any) {
      toast.error("Failed to place order", { description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!cart || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <ShoppingBag className="h-16 w-16 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold text-foreground">Nothing to checkout</h2>
        <p className="text-muted-foreground text-sm">Your cart is empty.</p>
        <Button onClick={() => navigate(tenantPath("orders/new"))}>Start Shopping</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Checkout</h1>
          <p className="text-muted-foreground">Review and place your order</p>
        </div>
        <Button variant="ghost" onClick={() => navigate(tenantPath("cart"))}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Cart
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Left: Form */}
        <div className="space-y-6">
          {/* Account — inline auth */}
          <CheckoutAuth />

          {/* Delivery Method */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-foreground">Delivery Method</h3>
            <RadioGroup
              value={deliveryMethod}
              onValueChange={(v) => setDeliveryMethod(v as "collection" | "delivery")}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="collection" id="collection" />
                <Label htmlFor="collection" className="cursor-pointer">
                  Collection — Pick up from our branch
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="delivery" id="delivery" />
                <Label htmlFor="delivery" className="cursor-pointer">
                  Delivery — Ship to your address
                </Label>
              </div>
            </RadioGroup>

            {/* Branch selector for collection */}
            {deliveryMethod === "collection" && branches && branches.length > 1 && (
              <div className="mt-3 space-y-1">
                <Label className="text-xs">Collection Branch</Label>
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a branch…" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}{b.city ? ` — ${b.city}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {deliveryMethod === "collection" && branches && branches.length === 1 && (
              <p className="text-sm text-muted-foreground mt-2">
                Collect from: <strong>{branches[0].name}</strong>{branches[0].city ? ` — ${branches[0].city}` : ""}
              </p>
            )}
          </div>

          {/* Delivery Address */}
          {deliveryMethod === "delivery" && (
            <div className="border border-border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-foreground">Delivery Address</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Contact Name</Label>
                  <Input
                    value={address.contact_name}
                    onChange={(e) => setAddress((p) => ({ ...p, contact_name: e.target.value }))}
                    placeholder="John Smith"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Company</Label>
                  <Input
                    value={address.company_name}
                    onChange={(e) => setAddress((p) => ({ ...p, company_name: e.target.value }))}
                    placeholder="Acme Corp"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Address Line 1 *</Label>
                <Input
                  value={address.line1}
                  onChange={(e) => setAddress((p) => ({ ...p, line1: e.target.value }))}
                  placeholder="123 Main Street"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Address Line 2</Label>
                <Input
                  value={address.line2}
                  onChange={(e) => setAddress((p) => ({ ...p, line2: e.target.value }))}
                  placeholder="Suite 4B"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">City</Label>
                  <Input
                    value={address.city}
                    onChange={(e) => setAddress((p) => ({ ...p, city: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Province</Label>
                  <Input
                    value={address.province}
                    onChange={(e) => setAddress((p) => ({ ...p, province: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Postal Code</Label>
                  <Input
                    value={address.postal_code}
                    onChange={(e) => setAddress((p) => ({ ...p, postal_code: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={address.phone}
                    onChange={(e) => setAddress((p) => ({ ...p, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email"
                    value={address.email}
                    onChange={(e) => setAddress((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Payment Method */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-foreground">Payment Method</h3>
            <RadioGroup
              value={paymentMethod}
              onValueChange={setPaymentMethod}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="offline" id="pm-offline" />
                <Label htmlFor="pm-offline" className="cursor-pointer">
                  Pay on collection / EFT (we'll send instructions)
                </Label>
              </div>
              {(onlineProviders ?? []).map((p) => (
                <div key={p.provider} className="flex items-center space-x-2">
                  <RadioGroupItem value={p.provider} id={`pm-${p.provider}`} />
                  <Label htmlFor={`pm-${p.provider}`} className="cursor-pointer">
                    {p.display_label || (p.provider === "stripe" ? "Pay by Card" : "PayFast")}
                    {p.mode === "test" && (
                      <span className="ml-2 text-xs text-muted-foreground">(sandbox)</span>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Notes */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-foreground">Special Instructions</h3>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requirements or notes for this order..."
              rows={3}
            />
          </div>
        </div>

        {/* Right: Order Summary */}
        <div className="border border-border rounded-lg p-4 space-y-4 h-fit sticky top-6">
          <h3 className="font-semibold text-foreground">Order Summary</h3>
          <div className="space-y-2">
            {items.map((item: any) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground truncate pr-2">
                  {item.title || "Untitled"} × {item.quantity}
                </span>
                <span className="font-mono text-foreground shrink-0">
                  {formatPrice(Number(item.unit_price) * item.quantity, currency)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-3 space-y-1.5">
            <div className="flex justify-between text-base font-bold">
              <span className="text-foreground">Total</span>
              <span className="font-mono text-foreground">{formatPrice(total, currency)}</span>
            </div>
          </div>
          <Button
            size="lg"
            className="w-full"
            onClick={handlePlaceOrder}
            disabled={isSubmitting || !user}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Placing Order…
              </>
            ) : (
              paymentMethod === "offline" ? "Place Order" : "Place Order & Pay"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
