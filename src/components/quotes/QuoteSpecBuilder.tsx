/**
 * QuoteSpecBuilder
 *
 * Admin / branch flow: build a priced quote for a customer BEFORE any
 * artwork exists. Reuses the same OptionsPanel + pricing engine the
 * customer hits so what you quote is exactly what the customer sees when
 * they upload artwork later.
 *
 * Flow:
 *   1. Pick / autocomplete the customer.
 *   2. Pick a product family.
 *   3. Choose specs via the shared OptionsPanel (single-section) OR the
 *      QuoteSectionsEditor (multi-section families like bound documents).
 *   4. Live price via `calculateItemPrice`.
 *   5. Save → creates a `quoted` holding order + order_item carrying the
 *      full spec (incl. sections) + a `quotes` row pointing at it, so the
 *      existing `useReactivateQuote` can clone it into a real cart when
 *      the customer uploads artwork.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCatalogBackedOptions } from "@/hooks/useCatalogBackedOptions";
import { usePackPricingOverridesForFamily } from "@/hooks/useProductPackPricingOverrides";
import { resolvePackPricing } from "@/lib/pricing/resolvePackPricing";
import type { QuantityBlock } from "@/hooks/useProductFamilies";
import {
  type ItemSpec,
  type ItemSpecSection,
} from "@/lib/calculatePrice";
import { useItemPricing } from "@/hooks/useItemPricing";
import { normaliseQuoteSections } from "@/lib/quotes/normaliseQuoteSections";
import { formatPrice } from "@/lib/formatCurrency";
import { toast } from "sonner";

import OptionsPanel, {
  MULTI_SECTION_FAMILIES,
} from "@/components/order/OptionsPanel";
import QuoteCustomerPicker, {
  type QuoteCustomerValue,
} from "./QuoteCustomerPicker";
import QuoteSectionsEditor, {
  makeDefaultSections,
  type QuoteSection,
} from "./QuoteSectionsEditor";

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
  const context: "branch" | "tenant" = branchId ? "branch" : "tenant";

  // ── Customer + quote meta ───────────────────────────────
  const [customer, setCustomer] = useState<QuoteCustomerValue>({
    email: "",
    name: "",
    profileId: null,
  });
  const [name, setName] = useState("");
  const [validityDays, setValidityDays] = useState(DEFAULT_VALIDITY_DAYS);
  const [notes, setNotes] = useState("");

  // ── Product + spec ──────────────────────────────────────
  const [familyId, setFamilyId] = useState<string>("");
  const [pageCount, setPageCount] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [isColor, setIsColor] = useState(true);
  const [isDuplex, setIsDuplex] = useState(true);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<QuoteSection[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Data loads ──────────────────────────────────────────
  const { data: families = [], isLoading: familiesLoading } = useQuery({
    queryKey: ["product_families_for_quote", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_families")
        .select(
          "id, name, slug, description, icon, quantity_mode, quantity_blocks",
        )
        .is("tenant_id", null)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const family = families.find((f) => f.id === familyId) ?? null;
  const familySlug = (family?.slug ?? "").toLowerCase();
  const isMultiSection = !!familySlug && MULTI_SECTION_FAMILIES.has(familySlug);

  const { data: options = [] } = useCatalogBackedOptions(familyId || null, branchId ?? null);

  // Pack-pricing ladder (branch > tenant > master).
  const { data: packOverrides = [] } = usePackPricingOverridesForFamily(
    familyId || null,
    tenantId,
  );
  const packBlocks = useMemo<QuantityBlock[]>(() => {
    const master =
      (family as any)?.quantity_blocks &&
      Array.isArray((family as any).quantity_blocks)
        ? ((family as any).quantity_blocks as QuantityBlock[])
        : [];
    const tenantOverride =
      packOverrides.find((r) => r.branch_id === null)?.quantity_blocks ?? null;
    const branchOverride = branchId
      ? packOverrides.find((r) => r.branch_id === branchId)?.quantity_blocks ??
        null
      : null;
    return resolvePackPricing({
      master,
      tenant: tenantOverride as any,
      branch: branchOverride as any,
    });
  }, [family, packOverrides, branchId]);
  const blocksActive = ((family as any)?.quantity_mode ?? "free") === "blocks";

  // ── Reset spec state when family changes ────────────────
  useEffect(() => {
    setSelectedOptions({});
    setPageCount(1);
    setQuantity(1);
    setIsColor(true);
    setIsDuplex(true);
    setSections(isMultiSection ? makeDefaultSections() : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  const handleOptionChange = (optionName: string, slug: string) =>
    setSelectedOptions((prev) => ({ ...prev, [optionName]: slug }));

  // ── Dummy A4 seed ───────────────────────────────────────
  // The customer configurator only unlocks after the PDF engine reports
  // page dimensions. Spec quotes have no artwork, so we simulate an A4
  // portrait upload: pre-select the Document Size option to whichever
  // value matches 210×297mm. Admin can change it afterwards; on artwork
  // upload the real size supersedes this seed.
  useEffect(() => {
    if (!familyId || options.length === 0) return;
    if (blocksActive) return; // pack ladder handles its own size selector
    const sizeOpt = options.find(
      (o) => o.name.trim().toLowerCase() === "document size",
    );
    if (!sizeOpt) return;
    const existingKey = Object.keys(selectedOptions).find(
      (k) => k.toLowerCase() === "document size",
    );
    if (existingKey && selectedOptions[existingKey]) return;
    const values = Array.isArray((sizeOpt as any).values)
      ? ((sizeOpt as any).values as any[])
      : [];
    const TOL = 3;
    const a4 = values.find((v) => {
      const m = (v?.metadata ?? {}) as Record<string, any>;
      const w = Number(m.width_mm ?? 0);
      const h = Number(m.height_mm ?? 0);
      if (!w || !h) return false;
      return (
        (Math.abs(w - 210) <= TOL && Math.abs(h - 297) <= TOL) ||
        (Math.abs(w - 297) <= TOL && Math.abs(h - 210) <= TOL)
      );
    }) ?? values.find((v) => String(v?.slug ?? "").toLowerCase() === "a4");
    if (a4?.slug) {
      setSelectedOptions((prev) => ({ ...prev, [sizeOpt.name]: a4.slug }));
    }
  }, [familyId, options, blocksActive, selectedOptions]);

  // Pack-mode (Flyers) equivalent: seed Document Size / Paper / Sides
  // from the first pack row that mentions A4, otherwise from the first
  // row. Mirrors the customer-side seed in OrderBuild.
  useEffect(() => {
    if (!familyId || !blocksActive || packBlocks.length === 0) return;
    const has = (key: string) =>
      !!Object.keys(selectedOptions).find(
        (k) => k.toLowerCase() === key.toLowerCase(),
      );
    if (has("Document Size") || has("Paper") || has("Print Sides")) return;
    const preferred =
      packBlocks.find((b) => (b.size ?? "").toLowerCase() === "a4") ??
      packBlocks[0];
    if (!preferred) return;
    setSelectedOptions((prev) => ({
      ...prev,
      ...(preferred.size && preferred.size !== "*"
        ? { "Document Size": preferred.size }
        : {}),
      ...(preferred.paper && preferred.paper !== "*"
        ? { Paper: preferred.paper }
        : {}),
      ...(preferred.sides ? { "Print Sides": preferred.sides } : {}),
    }));
  }, [familyId, blocksActive, packBlocks, selectedOptions]);

  // ── Derived spec ────────────────────────────────────────
  const spec: ItemSpec = useMemo(() => {
    if (isMultiSection && sections.length > 0) {
      const specSections: ItemSpecSection[] = sections.map((s) => ({
        label: s.label || s.role,
        page_count: Math.max(0, s.page_count),
        is_color: s.is_color,
        is_duplex: s.is_duplex,
      }));
      const totalPages = specSections.reduce((sum, s) => sum + s.page_count, 0);
      const anyColor = specSections.some((s) => s.is_color);
      const anyDuplex = specSections.some((s) => s.is_duplex);
      return {
        page_count: Math.max(1, totalPages),
        quantity: Math.max(1, quantity),
        is_color: anyColor,
        is_duplex: anyDuplex,
        selected_options: selectedOptions,
        sections: specSections,
      };
    }
    return {
      page_count: Math.max(1, pageCount),
      quantity: Math.max(1, quantity),
      is_color: isColor,
      is_duplex: isDuplex,
      selected_options: selectedOptions,
    };
  }, [
    isMultiSection,
    sections,
    pageCount,
    quantity,
    isColor,
    isDuplex,
    selectedOptions,
  ]);

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

  const canSave =
    !!user &&
    !!familyId &&
    !!customer.email.trim() &&
    quantity > 0 &&
    unitPrice > 0 &&
    (!isMultiSection || sections.length > 0);

  const handleSave = async () => {
    if (!canSave || !user || !family) return;
    setSaving(true);
    try {
      // 1. Best-effort match of an existing profile if the picker didn't
      //    already give us one.
      let profileId = customer.profileId;
      if (!profileId) {
        const { data: matched } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", customer.email.trim().toLowerCase())
          .maybeSingle();
        profileId = matched?.id ?? null;
      }

      // 2. Holding order — hidden from cart (status = quoted).
      const { data: holdingOrder, error: orderErr } = await supabase
        .from("orders")
        .insert({
          user_id: profileId ?? user.id,
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

      // 3. order_item carrying the full spec (incl. sections).
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

      // 4. Quote number.
      const { data: numberData, error: numErr } = await supabase.rpc(
        "generate_quote_number",
        { p_app_id: appId },
      );
      if (numErr) throw numErr;

      const validUntil = new Date(
        Date.now() + Math.max(1, validityDays) * 86400_000,
      ).toISOString();

      // 5. quotes row.
      const { data: quote, error: qErr } = await supabase
        .from("quotes")
        .insert({
          app_id: appId,
          tenant_id: tenantId,
          branch_id: branchId ?? null,
          quote_number: numberData as unknown as string,
          name: name || null,
          customer_profile_id: profileId ?? null,
          customer_email: customer.email.trim(),
          customer_name: customer.name.trim() || null,
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
              page_count: spec.page_count,
              is_color: spec.is_color,
              is_duplex: spec.is_duplex,
              options: selectedOptions,
              sections: spec.sections ?? null,
            },
          },
        } as any)
        .select("id, quote_number")
        .single();
      if (qErr) throw qErr;

      // 6. quote_items snapshot.
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
        product_snapshot: { name: family.name, slug: family.slug },
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
    <div className="space-y-6 max-w-5xl">
      {/* Customer */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Customer</h2>
        <QuoteCustomerPicker
          context={context}
          value={customer}
          onChange={setCustomer}
        />
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

      {/* Product picker */}
      <Card className="p-5 space-y-5">
        <h2 className="text-sm font-semibold text-foreground">
          Product &amp; specifications
        </h2>

        <div>
          <Label>Product</Label>
          {familiesLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={familyId} onValueChange={setFamilyId}>
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
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            {/* Left column — options + sections/basics */}
            <div className="space-y-5">
              <div className="rounded-lg border border-border bg-card p-3">
                <OptionsPanel
                  options={options}
                  selectedOptions={selectedOptions}
                  onOptionChange={handleOptionChange}
                  familySlug={family?.slug ?? undefined}
                  packBlocks={packBlocks}
                  blocksActive={blocksActive}
                />
              </div>

              {isMultiSection ? (
                <div className="rounded-lg border border-border bg-card p-3">
                  <QuoteSectionsEditor
                    sections={sections}
                    onChange={setSections}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-card p-3 grid grid-cols-2 md:grid-cols-4 gap-4">
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
                          {isColor ? "Full colour" : "B&W"}
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
              )}
            </div>

            {/* Right column — quantity + live price */}
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div>
                  <Label htmlFor="qty">Quantity</Label>
                  <Input
                    id="qty"
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                  />
                  {blocksActive && packBlocks.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pack-priced product — pick a quantity that matches an
                      available pack ({Array.from(
                        new Set(packBlocks.map((b) => b.qty)),
                      )
                        .sort((a, b) => a - b)
                        .join(", ")}).
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Unit × {quantity}
                    </div>
                    <div className="text-sm font-mono">
                      {formatPrice(unitPrice, currency)}
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
                  <div className="mt-4 pt-3 border-t space-y-1 text-xs text-muted-foreground max-h-56 overflow-auto">
                    {breakdown.lines.map((l, i) => (
                      <div key={i} className="flex justify-between font-mono">
                        <span className="truncate pr-2">{l.label}</span>
                        <span className="shrink-0">
                          {formatPrice(l.total, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {unitPrice === 0 && (
                  <p className="mt-3 text-xs text-amber-600">
                    No pricing rules matched this spec — check master pricing
                    for this product family before saving.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

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
