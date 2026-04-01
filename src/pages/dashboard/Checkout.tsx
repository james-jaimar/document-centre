import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCart, usePlaceOrder } from "@/hooks/useCart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

export default function Checkout() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: cart, isLoading } = useCart();
  const placeOrder = usePlaceOrder();

  const [deliveryMethod, setDeliveryMethod] = useState<"collection" | "delivery">("collection");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const vatRate = 0.15;
  const vat = subtotal * vatRate;
  const total = subtotal + vat;

  const handlePlaceOrder = async () => {
    if (!cart) return;
    if (deliveryMethod === "delivery" && !address.line1.trim()) {
      toast.error("Please enter a delivery address");
      return;
    }

    setIsSubmitting(true);
    try {
      await placeOrder.mutateAsync({
        cartOrderId: cart.id,
        deliveryMethod,
        notes: notes.trim() || undefined,
        deliveryAddress: deliveryMethod === "delivery" ? address : undefined,
      });
      navigate(`/t/${slug}/orders/${cart.id}/confirmation`);
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
        <Button onClick={() => navigate(`/t/${slug}/orders/new`)}>Start Shopping</Button>
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
        <Button variant="ghost" onClick={() => navigate(`/t/${slug}/cart`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Cart
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        {/* Left: Form */}
        <div className="space-y-6">
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
                  R{(Number(item.unit_price) * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-3 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono text-foreground">R{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">VAT (15%)</span>
              <span className="font-mono text-foreground">R{vat.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-1.5 border-t border-border">
              <span className="text-foreground">Total</span>
              <span className="font-mono text-foreground">R{total.toFixed(2)}</span>
            </div>
          </div>
          <Button
            size="lg"
            className="w-full"
            onClick={handlePlaceOrder}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Placing Order…
              </>
            ) : (
              "Place Order"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
