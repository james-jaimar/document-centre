import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useEffect, useMemo, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, MapPin, ShoppingBag, Truck } from "lucide-react";
import { toast } from "sonner";
import { useRegionalPricing } from "@/hooks/useRegionalPricing";
import { formatPrice } from "@/lib/formatCurrency";
import CheckoutAuth from "@/components/checkout/CheckoutAuth";
import { quoteShipping, listShippingQuotes, type ShippingQuoteResult, type ShippingMethodOption } from "@/lib/delivery/quoteShipping";
import AddressPicker from "@/components/customer/AddressPicker";
import { Checkbox } from "@/components/ui/checkbox";
import { useCustomerAddresses } from "@/hooks/useCustomerAddresses";

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
  const [poNumber, setPoNumber] = useState("");
  const [costCentre, setCostCentre] = useState("");
  const [saveAddress, setSaveAddress] = useState(false);
  const { create: createSavedAddress } = useCustomerAddresses(user?.id);

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

  // Shipping quote (only relevant when delivery is selected)
  const [shippingQuote, setShippingQuote] = useState<ShippingQuoteResult | null>(null);
  const [quotingShipping, setQuotingShipping] = useState(false);
  const [shippingOptions, setShippingOptions] = useState<ShippingMethodOption[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);

  const quoteKey = useMemo(() => JSON.stringify({
    m: deliveryMethod,
    c: address.city.trim().toLowerCase(),
    p: address.postal_code.trim(),
    pv: address.province.trim().toLowerCase(),
    items: items.map((i) => ({ id: i.id, q: i.quantity })),
  }), [deliveryMethod, address.city, address.postal_code, address.province, items]);

  // 1. Resolve zone + list available shipping methods when address changes.
  useEffect(() => {
    if (deliveryMethod !== "delivery") {
      setShippingOptions([]);
      setSelectedMethodId(null);
      setShippingQuote(null);
      return;
    }
    if (!items.length) { setShippingOptions([]); return; }
    if (!address.city.trim() && !address.postal_code.trim() && !address.province.trim()) {
      setShippingOptions([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await listShippingQuotes({
          tenantId: tenantId ?? null,
          branchId: collectionBranch?.id ?? null,
          address: {
            city: address.city,
            postal_code: address.postal_code,
            province: address.province,
            country: "ZA",
          },
          items,
          currency,
        });
        setShippingOptions(res.options);
        // Auto-select cheapest if nothing selected or current selection no longer available.
        setSelectedMethodId((curr) => {
          if (curr && res.options.some((o) => o.methodId === curr)) return curr;
          const cheapest = [...res.options]
            .filter((o) => o.price != null)
            .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];
          return cheapest?.methodId ?? null;
        });
      } catch (err) {
        console.warn("[checkout] shipping options failed", err);
        setShippingOptions([]);
      }
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey, tenantId, collectionBranch?.id, currency]);

  // 2. Quote the selected method (for label, zone, persisted method id, etc).
  useEffect(() => {
    if (deliveryMethod !== "delivery" || !selectedMethodId || !items.length) {
      setShippingQuote(null);
      return;
    }
    setQuotingShipping(true);
    (async () => {
      try {
        const q = await quoteShipping({
          tenantId: tenantId ?? null,
          branchId: collectionBranch?.id ?? null,
          address: {
            city: address.city,
            postal_code: address.postal_code,
            province: address.province,
            country: "ZA",
          },
          items,
          methodId: selectedMethodId,
          currency,
        });
        setShippingQuote(q);
      } catch (err) {
        console.warn("[checkout] shipping quote failed", err);
        setShippingQuote(null);
      } finally {
        setQuotingShipping(false);
      }
    })();
  }, [selectedMethodId, quoteKey, tenantId, collectionBranch?.id, currency]);


  const deliveryFee = deliveryMethod === "delivery" ? (shippingQuote?.price ?? 0) : 0;
  // Demo mode: no VAT/tax line. Tenants will configure their own tax rules later.
  const total = subtotal + deliveryFee;

  const handlePlaceOrder = async () => {
    if (!cart) return;
    if (deliveryMethod === "collection" && !collectionBranch) {
      toast.error("No collection branch selected");
      return;
    }
    if (deliveryMethod === "delivery" && !address.line1.trim()) {
      toast.error("Please enter a delivery address");
      return;
    }
    if (deliveryMethod === "delivery" && shippingQuote && shippingQuote.price == null) {
      toast.error("We couldn't quote delivery to that address. Please check the city / postal code.");
      return;
    }

    setIsSubmitting(true);
    try {
      const newOrderId = await placeOrder.mutateAsync({
        cartOrderId: cart.id,
        deliveryMethod,
        notes: notes.trim() || undefined,
        deliveryAddress: deliveryMethod === "delivery" ? address : undefined,
        branchId: deliveryMethod === "collection" ? collectionBranch?.id : undefined,
        deliveryAmount: deliveryFee,
        deliveryMethodCode: shippingQuote?.methodLabel ?? undefined,
        deliveryZoneCode: shippingQuote?.zoneCode ?? undefined,
      });

      // Persist PO / cost centre on the new order (best-effort).
      if (poNumber.trim() || costCentre.trim()) {
        try {
          await supabase
            .from("orders")
            .update({
              po_number: poNumber.trim() || null,
              cost_centre: costCentre.trim() || null,
            })
            .eq("id", newOrderId);
        } catch (e) {
          console.warn("Failed to persist PO/cost centre:", e);
        }
      }

      // Save delivery address to the customer's address book if requested.
      if (saveAddress && deliveryMethod === "delivery" && user && address.line1.trim()) {
        try {
          await createSavedAddress.mutateAsync({
            address_type: "delivery",
            contact_name: address.contact_name || null,
            company_name: address.company_name || null,
            phone: address.phone || null,
            email: address.email || null,
            line1: address.line1 || null,
            line2: address.line2 || null,
            city: address.city || null,
            province: address.province || null,
            postal_code: address.postal_code || null,
            country: "South Africa",
          });
        } catch (e) {
          console.warn("Failed to save address to address book:", e);
        }
      }

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

            {/* Branch is locked to the active storefront branch */}
            {deliveryMethod === "collection" && collectionBranch && (
              <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">Collection Branch</div>
                    <div className="text-sm font-medium text-foreground">
                      {collectionBranch.name}
                      {collectionBranch.city ? ` — ${collectionBranch.city}` : ""}
                    </div>
                    {liveBranches.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setShowBranchSwitch(true)}
                        className="mt-1 text-xs text-primary hover:underline"
                      >
                        Change branch
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Change-branch confirmation */}
          <AlertDialog open={showBranchSwitch} onOpenChange={setShowBranchSwitch}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Switch to a different branch?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>
                      You're currently checking out at <strong>{collectionBranch?.name}</strong>.
                      Each branch has its own pricing, stock and lead times, and your
                      customer account is registered against this branch.
                    </p>
                    <p>
                      If you switch branches we'll send you to that branch's storefront
                      — your cart items may need to be re-added so they can be re-priced
                      against the new branch's rate card.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid gap-2 max-h-72 overflow-y-auto py-2">
                {liveBranches
                  .filter((b) => b.id !== collectionBranch?.id)
                  .map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        const seg = branchUrlSlug(b);
                        const target = isSubdomain ? `/${seg}/checkout` : `/t/${slug}/${seg}/checkout`;
                        window.location.href = target;
                      }}
                      className="flex items-start gap-2 rounded-md border border-border bg-background p-3 text-left hover:border-primary/40 hover:bg-primary/5"
                    >
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium text-foreground">{b.name}</div>
                        {b.city && <div className="text-xs text-muted-foreground">{b.city}</div>}
                      </div>
                    </button>
                  ))}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Stay here</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delivery Address */}
          {deliveryMethod === "delivery" && (
            <div className="border border-border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-foreground">Delivery Address</h3>
              {user && (
                <AddressPicker
                  onSelect={(addr) => {
                    setAddress({
                      contact_name: addr.contact_name ?? "",
                      company_name: addr.company_name ?? "",
                      line1: addr.line1 ?? "",
                      line2: addr.line2 ?? "",
                      city: addr.city ?? "",
                      province: addr.province ?? "",
                      postal_code: addr.postal_code ?? "",
                      phone: addr.phone ?? "",
                      email: addr.email ?? "",
                    });
                    setSaveAddress(false);
                  }}
                />
              )}
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
                  <Label className="text-xs">Province *</Label>
                  <Select
                    value={address.province}
                    onValueChange={(v) => setAddress((p) => ({ ...p, province: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {[
                        "Eastern Cape","Free State","Gauteng","KwaZulu-Natal",
                        "Limpopo","Mpumalanga","Northern Cape","North West","Western Cape",
                      ].map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              {user && (
                <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={saveAddress}
                    onCheckedChange={(v) => setSaveAddress(!!v)}
                  />
                  Save this address for next time
                </label>
              )}
            </div>
          )}

          {/* Delivery Options */}
          {deliveryMethod === "delivery" && shippingOptions.length > 0 && (
            <div className="border border-border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-foreground">Delivery Option</h3>
              <RadioGroup
                value={selectedMethodId ?? ""}
                onValueChange={setSelectedMethodId}
                className="space-y-2"
              >
                {shippingOptions.map((o) => (
                  <div key={o.methodId} className="flex items-center justify-between gap-3 rounded-md border border-border p-3 hover:border-primary/40">
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value={o.methodId} id={`sm-${o.methodId}`} className="mt-1" />
                      <Label htmlFor={`sm-${o.methodId}`} className="cursor-pointer">
                        <div className="text-sm font-medium text-foreground">{o.label}</div>
                        {o.description && (
                          <div className="text-xs text-muted-foreground">{o.description}</div>
                        )}
                      </Label>
                    </div>
                    <div className="font-mono text-sm text-foreground shrink-0">
                      {o.price != null ? formatPrice(o.price, o.currency) : "—"}
                    </div>
                  </div>
                ))}
              </RadioGroup>
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
                  EFT — Pay by bank transfer (we'll email banking details &amp; a Pro Forma invoice)
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

          {/* PO / Cost Centre (optional) */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-foreground">Reference (optional)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">PO Number</Label>
                <Input
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="e.g. PO-2025-0142"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cost Centre</Label>
                <Input
                  value={costCentre}
                  onChange={(e) => setCostCentre(e.target.value)}
                  placeholder="e.g. Marketing"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Shown on your invoice and order details for reconciliation.
            </p>
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
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono text-foreground">{formatPrice(subtotal, currency)}</span>
            </div>
            {deliveryMethod === "delivery" && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5" />
                  Delivery
                  {shippingQuote?.zoneLabel && (
                    <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5">
                      {shippingQuote.zoneLabel}
                    </Badge>
                  )}
                </span>
                <span className="font-mono text-foreground">
                  {quotingShipping
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" />
                    : shippingQuote?.price != null
                      ? formatPrice(deliveryFee, currency)
                      : <span className="text-muted-foreground text-xs">enter address</span>}
                </span>
              </div>
            )}
            {deliveryMethod === "delivery" && shippingQuote && (
              <div className="text-[11px] text-muted-foreground">
                Billable weight: {shippingQuote.billableKg.toFixed(2)}kg
                {shippingQuote.volumetricKg > shippingQuote.physicalKg && " (volumetric)"}
                {shippingQuote.methodLabel && ` • ${shippingQuote.methodLabel}`}
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-1">
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
