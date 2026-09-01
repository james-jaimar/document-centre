import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useStorefrontPages } from "@/hooks/useStorefrontPages";
import { useStorefrontCatalogue } from "@/hooks/useStorefrontCatalogue";
import { useStorefrontPrice } from "@/hooks/useStorefrontPrice";
import { useCustomerPricingTier } from "@/hooks/useCustomerPricingTier";
import {
  normalizeOptions,
  visibleOptions,
  blockMatchesOption,
  packQuantitiesForOption,
} from "@/lib/pricing/packOptions";


import AssuranceBar from "@/components/storefront/AssuranceBar";
import ProductGallery from "@/components/storefront/ProductGallery";
import StorefrontFooterStrip from "@/components/storefront/StorefrontFooterStrip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, Truck, Store, Clock } from "lucide-react";
import { familyImages } from "@/lib/storefront/productImages";
import { isEditableFamily, startOrderPath } from "@/lib/storefront/catalogue";

const ANY = "*";
const label = (v: string) => (v === ANY ? "Any" : v.replace(/_/g, " "));

export default function StorefrontProduct() {
  const { familySlug } = useParams();
  const navigate = useNavigate();
  const { tenantPath } = useTenantSlug();
  const { tenantId } = useTenantContext();
  const { config } = useStorefrontPages(tenantId);
  const { entries, isLoading } = useStorefrontCatalogue();
  const { format, inclSuffix } = useStorefrontPrice();
  const { tier: pricingTier } = useCustomerPricingTier();

  const entry = entries.find((e) => e.family.slug === familySlug);
  const allBlocks = entry?.blocks ?? [];

  // Finishing options (e.g. "with Gloss Lam" / "with Matt Lam"). Trade-only
  // options are never shown to consumers.
  const options = useMemo(
    () => visibleOptions(normalizeOptions((entry?.family as any)?.pricing_options), pricingTier),
    [entry?.family, pricingTier],
  );
  const [option, setOption] = useState<string | null>(null);
  const activeOption =
    (option && options.some((o) => o.slug === option) ? option : options[0]?.slug) ?? null;

  // Every axis below is derived from the rows priced for the chosen option,
  // otherwise duplicate quantities appear once per option.
  const blocks = useMemo(
    () => allBlocks.filter((b) => blockMatchesOption(b, activeOption)),
    [allBlocks, activeOption],
  );

  const sizes = useMemo(() => [...new Set(blocks.map((b) => b.size))], [blocks]);
  const [size, setSize] = useState<string | null>(null);
  const activeSize = size && sizes.includes(size) ? size : sizes[0] ?? null;

  const papers = useMemo(
    () => [...new Set(blocks.filter((b) => b.size === activeSize).map((b) => b.paper))],
    [blocks, activeSize],
  );
  const [paper, setPaper] = useState<string | null>(null);
  const activePaper = paper && papers.includes(paper) ? paper : papers[0] ?? null;

  const sidesOptions = useMemo(
    () => [
      ...new Set(
        blocks
          .filter((b) => b.size === activeSize && b.paper === activePaper)
          .map((b) => b.sides),
      ),
    ],
    [blocks, activeSize, activePaper],
  );
  const [sides, setSides] = useState<string | null>(null);
  const activeSides =
    sides && sidesOptions.includes(sides as any) ? sides : sidesOptions[0] ?? null;

  const rows = useMemo(
    () =>
      packQuantitiesForOption(
        blocks.filter(
          (b) => b.size === activeSize && b.paper === activePaper && b.sides === activeSides,
        ),
        activeOption,
        pricingTier,
        options,
      ).map((r) => ({ qty: r.qty, priceMajor: r.priceMinor / 100 })),
    [blocks, activeSize, activePaper, activeSides, activeOption, pricingTier, options],
  );


  const [qty, setQty] = useState<number | null>(null);
  const activeQty = qty && rows.some((r) => r.qty === qty) ? qty : rows[0]?.qty ?? null;
  const activeRow = rows.find((r) => r.qty === activeQty) ?? null;


  if (isLoading) {
    return (
      <div className="dc-storefront sf-container space-y-6 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="dc-storefront sf-container max-w-3xl py-20 text-center">
        <h1 className="text-2xl font-bold text-foreground">Product not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This product isn't available on your storefront.
        </p>
        <Button className="mt-6" onClick={() => navigate(tenantPath("shop"))}>
          Back to shop
        </Button>
      </div>
    );
  }

  const { family } = entry;
  const editable = isEditableFamily(family);
  const images = familyImages(family, config.images);
  const chips = [
    editable ? "Customise online" : "Upload artwork",
    ...(entry.sizes.length ? [entry.sizes.slice(0, 3).join(" · ")] : []),
    config.turnaround_note,
  ].filter(Boolean) as string[];

  return (
    <div className="dc-storefront">
      <AssuranceBar items={config.assurance_items} />

      <div className="sf-container py-8">
        <nav className="mb-5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <button onClick={() => navigate(tenantPath("shop"))} className="hover:text-foreground">
            Shop
          </button>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="text-foreground">{family.name}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <ProductGallery images={images} alt={family.name} />

          <div className="space-y-5">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{family.name}</h1>
              {family.description && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {family.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {rows.length > 0 && (
              <div className="rounded-xl border bg-card p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  {sizes.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Size</p>
                      <Select value={activeSize ?? ""} onValueChange={setSize}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {sizes.map((s) => (
                            <SelectItem key={s} value={s}>{label(s)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {rows.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Quantity</p>
                      <Select
                        value={activeQty ? String(activeQty) : ""}
                        onValueChange={(v) => setQty(Number(v))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {rows.map((r) => (
                            <SelectItem key={r.qty} value={String(r.qty)}>
                              {r.qty.toLocaleString()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {papers.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Paper</p>
                      <Select value={activePaper ?? ""} onValueChange={setPaper}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {papers.map((p) => (
                            <SelectItem key={p} value={p}>{label(p)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {sidesOptions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Sides</p>
                      <Select value={activeSides ?? ""} onValueChange={setSides}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {sidesOptions.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s === "double" ? "Double sided" : "Single sided"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {activeRow && (
                  <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-xl sf-accent-soft p-4">
                    <div>
                      <p className="text-xs">Your price</p>
                      <p className="text-3xl font-bold tabular-nums">
                        {format(activeRow.priceMajor)}
                      </p>
                      <p className="mt-1 text-xs">
                        {activeQty?.toLocaleString()} units ·{" "}
                        {format(activeRow.priceMajor / Math.max(1, activeRow.qty))} each
                        {inclSuffix ? ` · ${inclSuffix}` : ""}
                      </p>
                    </div>
                    <p className="flex items-center gap-1.5 text-xs">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {config.turnaround_note}
                    </p>
                  </div>
                )}
              </div>
            )}

            <Button
              size="lg"
              className="h-12 w-full text-[15px]"
              onClick={() => navigate(tenantPath(startOrderPath(family)))}
            >
              {editable ? "Start designing" : "Upload artwork"}
            </Button>

            {editable && (
              <Button
                size="lg"
                variant="outline"
                className="h-12 w-full text-[15px]"
                onClick={() => navigate(tenantPath(startOrderPath(family, "upload")))}
              >
                Upload my own artwork
              </Button>
            )}

            <div className="grid divide-y rounded-xl border text-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <p className="flex items-center gap-2 px-4 py-3 text-muted-foreground">
                <Truck className="h-4 w-4" aria-hidden />
                {config.delivery_note}
              </p>
              <p className="flex items-center gap-2 px-4 py-3 text-muted-foreground">
                <Store className="h-4 w-4" aria-hidden />
                {config.collect_note}
              </p>
            </div>

            <Accordion type="single" collapsible>
              <AccordionItem value="specs">
                <AccordionTrigger className="text-sm">Specifications</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {entry.sizes.length
                    ? `Available sizes: ${entry.sizes.join(", ")}.`
                    : "Sizes and materials are confirmed during configuration."}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="artwork">
                <AccordionTrigger className="text-sm">Artwork requirements</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  Supply print-ready PDF. We automatically preflight every file for size, bleed,
                  fonts and image resolution, and flag anything that needs attention before print.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="delivery">
                <AccordionTrigger className="text-sm">Turnaround & delivery</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {config.turnaround_note}. {config.delivery_note} or {config.collect_note.toLowerCase()}.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>

      <StorefrontFooterStrip items={config.footer_items} note={config.footer_note} />
    </div>
  );
}
