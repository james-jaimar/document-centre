/**
 * QuoteSpecBuilder
 *
 * Admin / branch flow: build a priced quote for a customer BEFORE any artwork
 * exists. Instead of forking the pricing engine, we create a real "holding"
 * order + order_item with the entered spec — this reuses the same pricing
 * engine the customer would hit, and the existing `useReactivateQuote` hook
 * can later clone it into a cart when the customer accepts and uploads real
 * artwork.
 *
 * Flow:
 *   1. Pick customer (email + optional display name).
 *   2. Pick product family.
 *   3. Enter specs (quantity, page count, colour, sides + dynamic options).
 *   4. Live pricing via `calculateItemPrice`.
 *   5. Save → creates holding order, order_item (build_status='ready'),
 *      quote row with `source_order_id = holdingOrder.id`, and one
 *      quote_item snapshot. The customer can Accept the quote later.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProductOptions } from "@/hooks/useProductOptions";
import { usePricingRules } from "@/hooks/usePricingRules";
import {
  calculateItemPrice,
  type ItemSpec,
  type PriceBreakdown,
} from "@/lib/calculatePrice";
import { isStructuredValues } from "@/lib/productOptionTypes";
import { formatPrice } from "@/lib/formatCurrency";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";

const DEFAULT_VALIDITY_DAYS = 30;

interface Props {
  tenantId: string;
  appId: string;
  branchId?: string | null;
  currency?: string;
  /** `tenant_sales` for admin, `branch_sales` for branch. */
  createdVia: "tenant_sales" | "branch_sales";
  onCreated: (quote: { id: string; quote_number: string }) => void;
  onCancel: () => void;
}

export default function QuoteSpecBuilder({
  tenantId,
  appId,
  branchId,
  currency = "ZAR",
  createdVia,
  onCreated,
  onCancel,
}: Props) {
  const { user } = useAuth();

  // ── Customer + quote meta ───────────────────────────────
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [name, setName] = useState("");
  const [validityDays, setValidityDays] = useState(DEFAULT_VALIDITY_DAYS);
  const [notes, setNotes] = useState("");

  // ── Product + spec ──────────────────────────────────────
  const [familyId, setFamilyId] = useState<string>("");
  const [pageCount, setPageCount] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [isColor, setIsColor] = useState(true);
  const [isDuplex, setIsDuplex] = useState(true);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});

  const [saving, setSaving] = useState(false);

  // ── Data loads ──────────────────────────────────────────
  const { data: families = [], isLoading: familiesLoading } = useQuery({
    queryKey: ["product_families_for_quote", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_families")
        .select("id, name, slug, description, icon")
        .is("tenant_id", null)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const family = families.find((f) => f.id === familyId) ?? null;
  const { data: options = [] } = useProductOptions(familyId || null);
  // Use master pricing rules (source of truth). Branch-specific overrides via
  // the branch pricing layer can be added in a later pass — for a spec-only
  // quote it's acceptable to price off the canonical rules.
  const { data: rulesRaw = [] } = usePricingRules(tenantId, currency, {
    masterOnly: true,
  });
  const rules = useMemo(
    () => rulesRaw.filter((r) => r.product_family_id === familyId),
    [rulesRaw, familyId],
  );

  // Seed default option selections when family changes.
  const seedDefaults = (fid: string) => {
    setFamilyId(fid);
    const next: Record<string, string> = {};
    // options is not yet loaded for the new family — we reseed on next render
    // via an effect-less pattern by relying on Select's undefined default.
    setSelectedOptions(next);
  };

  // ── Price preview ───────────────────────────────────────
  const spec: ItemSpec = useMemo(
    () => ({
      page_count: Math.max(1, pageCount),
      quantity: Math.max(1, quantity),
      is_color: isColor,
      is_duplex: isDuplex,
      selected_options: selectedOptions,
    }),
    [pageCount, quantity, isColor, isDuplex, selectedOptions],
  );

  const breakdown: PriceBreakdown | null = useMemo(() => {
    if (!familyId) return null;
    try {
      return calculateItemPrice(spec, options, rules, currency);
    } catch {
      return null;
    }
  }, [familyId, spec, options, rules, currency]);

  const unitPrice = breakdown?.subtotal_per_unit ?? 0;
  const total = breakdown?.total ?? 0;

  // ── Save ────────────────────────────────────────────────
  const canSave =
    !!user &&
    !!familyId &&
    !!customerEmail.trim() &&
    quantity > 0 &&
    unitPrice > 0;

  const handleSave = async () => {
    if (!canSave || !user || !family) return;
    setSaving(true);
    try {
      // 1. Match existing customer profile (best effort).
      const { data: matched } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", customerEmail.trim().toLowerCase())
        .maybeSingle();

      // 2. Create the holding order (status='quoted' — hidden from cart).
      const { data: holdingOrder, error: orderErr } = await supabase
        .from("orders")
        .insert({
          user_id: matched?.id ?? user.id,
          tenant_id: tenantId,
          app_id: appId,
          branch_id: branchId ?? null,
          order_status: "quoted" as any,
          total_price: total,
          currency,
          metadata: { is_spec_quote_holding: true },
        })
        .select("id")
        .single();
      if (orderErr) throw orderErr;

      // 3. Create the order_item with the entered spec — no docs attached.
      const { data: holdingItem, error: itemErr } = await supabase
        .from("order_items")
        .insert({
          order_id: holdingOrder.id,
          product_family_id: familyId,
          quantity,
          unit_price: unitPrice,
          build_status: "ready" as any,
          spec: spec as any,
          title: name || family.name,
        })
        .select("id")
        .single();
      if (itemErr) throw itemErr;

      // 4. Resolve a quote number.
      const { data: numberData, error: numErr } = await supabase.rpc(
        "generate_quote_number",
        { p_app_id: appId },
      );
      if (numErr) throw numErr;

      const validUntil = new Date(
        Date.now() + Math.max(1, validityDays) * 86400_000,
      ).toISOString();

      // 5. Insert the quote pointing at the holding order.
      const { data: quote, error: qErr } = await supabase
        .from("quotes")
        .insert({
          app_id: appId,
          tenant_id: tenantId,
          branch_id: branchId ?? null,
          quote_number: numberData as unknown as string,
          name: name || null,
          customer_profile_id: matched?.id ?? null,
          customer_email: customerEmail.trim(),
          customer_name: customerName.trim() || null,
          created_by_profile_id: user.id,
          created_via: createdVia,
          source_order_id: holdingOrder.id,
          quote_status: "active" as any,
          valid_until: validUntil,
          currency,
          subtotal: total,
          total_amount: total,
          notes_internal: notes || null,
          metadata: {
            is_spec_quote: true,
            spec_summary: {
              product: family.name,
              quantity,
              page_count: pageCount,
              is_color: isColor,
              is_duplex: isDuplex,
              options: selectedOptions,
            },
          },
        })
        .select("id, quote_number")
        .single();
      if (qErr) throw qErr;

      // 6. Snapshot into quote_items.
      const { error: snapErr } = await supabase.from("quote_items").insert({
        quote_id: quote.id,
        sequence_no: 1,
        product_family_id: familyId,
        product_name: family.name,
        job_name: name || null,
        quantity,
        unit_price: unitPrice,
        net_price: total,
        gross_price: total,
        source_job_id: holdingItem.id,
        product_snapshot: {
          name: family.name,
          slug: family.slug,
        },
        configuration: spec as any,
      } as any);
      if (snapErr) throw snapErr;

      toast.success(`Quote ${quote.quote_number} created`);
      onCreated({ id: quote.id, quote_number: quote.quote_number });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create quote");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Customer */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Customer</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="email">Customer email *</Label>
            <Input
              id="email"
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="customer@company.com"
            />
          </div>
          <div>
            <Label htmlFor="cname">Customer name</Label>
            <Input
              id="cname"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Jane Smith / Acme Ltd"
            />
          </div>
        </div>
      </Card>

      {/* Quote meta */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Quote details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="qname">Reference / job name</Label>
            <Input
              id="qname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q3 marketing print run"
            />
          </div>
          <div>
            <Label htmlFor="valid">Valid for (days)</Label>
            <Input
              id="valid"
              type="number"
              min={1}
              value={validityDays}
              onChange={(e) =>
                setValidityDays(Number(e.target.value) || DEFAULT_VALIDITY_DAYS)
              }
            />
          </div>
        </div>
        <div>
          <Label htmlFor="notes">Internal notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
      </Card>

      {/* Product + spec */}
      <Card className="p-5 space-y-5">
        <h2 className="text-sm font-semibold text-foreground">
          Product &amp; specifications
        </h2>

        <div>
          <Label>Product</Label>
          {familiesLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={familyId} onValueChange={seedDefaults}>
              <SelectTrigger>
                <SelectValue placeholder="Select a product…" />
              </SelectTrigger>
              <SelectContent>
                {families.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {familyId && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="qty">Quantity</Label>
                <Input
                  id="qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label htmlFor="pages">Page count</Label>
                <Input
                  id="pages"
                  type="number"
                  min={1}
                  value={pageCount}
                  onChange={(e) => setPageCount(Number(e.target.value) || 1)}
                />
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-3">
                  <Switch checked={isColor} onCheckedChange={setIsColor} />
                  <div className="text-sm">
                    <div>Colour</div>
                    <div className="text-xs text-muted-foreground">
                      {isColor ? "Full colour" : "B&amp;W"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-3">
                  <Switch checked={isDuplex} onCheckedChange={setIsDuplex} />
                  <div className="text-sm">
                    <div>Double-sided</div>
                    <div className="text-xs text-muted-foreground">
                      {isDuplex ? "Duplex" : "Single-sided"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic product options */}
            {options.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                {options.map((opt) => {
                  const values = opt.values as unknown;
                  if (!isStructuredValues(values)) return null;
                  const active = values.filter((v) => v.is_active !== false);
                  if (active.length === 0) return null;
                  return (
                    <div key={opt.id}>
                      <Label>{opt.name}</Label>
                      <Select
                        value={selectedOptions[opt.name] ?? ""}
                        onValueChange={(val) =>
                          setSelectedOptions((prev) => ({
                            ...prev,
                            [opt.name]: val,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select…" />
                        </SelectTrigger>
                        <SelectContent>
                          {active.map((v) => (
                            <SelectItem key={v.slug} value={v.slug}>
                              {v.label.toUpperCase() === v.label
                                ? v.label
                                : v.label}
                              {v.price_impact > 0 &&
                                ` (+${formatPrice(v.price_impact, currency)})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Card>

      {/* Price preview */}
      {familyId && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">
                Unit price × {quantity}
              </div>
              <div className="text-sm font-mono">
                {formatPrice(unitPrice, currency)} × {quantity}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-2xl font-bold font-mono">
                {formatPrice(total, currency)}
              </div>
            </div>
          </div>
          {breakdown && breakdown.lines.length > 0 && (
            <div className="mt-4 pt-3 border-t space-y-1 text-xs text-muted-foreground">
              {breakdown.lines.map((l, i) => (
                <div key={i} className="flex justify-between font-mono">
                  <span>{l.label}</span>
                  <span>
                    {formatPrice(l.unit_amount, currency)} × {l.multiplier} ={" "}
                    {formatPrice(l.total, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {unitPrice === 0 && (
            <p className="mt-3 text-xs text-amber-600">
              No pricing rules matched this spec — check master pricing for this
              product family before saving.
            </p>
          )}
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!canSave || saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…
            </>
          ) : (
            "Create quote"
          )}
        </Button>
      </div>
    </div>
  );
}
