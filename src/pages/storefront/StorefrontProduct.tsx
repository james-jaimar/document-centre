import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTenantSlug } from "@/hooks/useTenantSlug";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useStorefrontPages } from "@/hooks/useStorefrontPages";
import { useStorefrontCatalogue } from "@/hooks/useStorefrontCatalogue";
import { useStorefrontPrice } from "@/hooks/useStorefrontPrice";
import AssuranceBar from "@/components/storefront/AssuranceBar";
import PriceBreakTable from "@/components/storefront/PriceBreakTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, Truck, Store, FileText } from "lucide-react";
import { familyImage } from "@/lib/storefront/productImages";
import { isEditableFamily, startOrderPath } from "@/lib/storefront/catalogue";

const ANY = "*";
const label = (v: string) => (v === ANY ? "Any" : v.replace(/_/g, " ").toUpperCase());

export default function StorefrontProduct() {
  const { familySlug } = useParams();
  const navigate = useNavigate();
  const { tenantPath } = useTenantSlug();
  const { tenantId } = useTenantContext();
  const { config } = useStorefrontPages(tenantId);
  const { entries, isLoading } = useStorefrontCatalogue();
  const { format } = useStorefrontPrice();

  const entry = entries.find((e) => e.family.slug === familySlug);
  const blocks = entry?.blocks ?? [];

  const sizes = useMemo(() => [...new Set(blocks.map((b) => b.size))], [blocks]);
  const [size, setSize] = useState<string | null>(null);
  const activeSize = size ?? sizes[0] ?? null;

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
      blocks
        .filter(
          (b) =>
            b.size === activeSize && b.paper === activePaper && b.sides === activeSides,
        )
        .map((b) => ({ qty: b.qty, priceMajor: b.price_minor / 100 }))
        .sort((a, b) => a.qty - b.qty),
    [blocks, activeSize, activePaper, activeSides],
  );

  const [qty, setQty] = useState<number | null>(null);
  const activeQty = qty && rows.some((r) => r.qty === qty) ? qty : rows[0]?.qty ?? null;
  const activeRow = rows.find((r) => r.qty === activeQty) ?? null;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
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
  const image = familyImage(family);

  return (
    <div className="dc-storefront -mx-4 -my-4 md:-mx-6 md:-my-6">
      <AssuranceBar items={config.assurance_items} />

      <div className="mx-auto max-w-7xl px-6 py-8">
        <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <button onClick={() => navigate(tenantPath("shop"))} className="hover:text-foreground">
            Shop
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{family.name}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2">
          {/* Gallery */}
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl border bg-muted">
              {image ? (
                <img src={image} alt={family.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center">
                  <FileText className="h-12 w-12 text-muted-foreground/40" />
                </div>
              )}
            </div>
          </div>

          {/* Config */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{family.name}</h1>
              {family.description && (
                <p className="mt-2 text-sm text-muted-foreground">{family.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant={editable ? "default" : "secondary"}>
                  {editable ? "Customise online" : "Upload artwork"}
                </Badge>
                {entry.fromPrice != null && (
                  <Badge variant="outline">From {format(entry.fromPrice)}</Badge>
                )}
              </div>
            </div>

            {rows.length > 0 && (
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="grid gap-4 sm:grid-cols-3">
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

                  <PriceBreakTable
                    rows={rows}
                    activeQty={activeQty}
                    format={(v) => format(v) ?? ""}
                    onSelect={setQty}
                  />

                  {activeRow && (
                    <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Your price</p>
                        <p className="text-2xl font-bold tabular-nums text-foreground">
                          {format(activeRow.priceMajor)}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {activeQty?.toLocaleString()} units
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Button size="lg" className="w-full" onClick={() => navigate(tenantPath(startOrderPath(family)))}>
              {editable ? "Start designing" : "Upload artwork"}
            </Button>

            <div className="flex flex-wrap gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Delivery available</span>
              <span className="flex items-center gap-1.5"><Store className="h-3.5 w-3.5" /> Collect in store</span>
            </div>

            <Accordion type="single" collapsible>
              <AccordionItem value="artwork">
                <AccordionTrigger className="text-sm">Artwork requirements</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  Supply print-ready PDF. We automatically preflight every file for size, bleed,
                  fonts and image resolution, and flag anything that needs attention before print.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="turnaround">
                <AccordionTrigger className="text-sm">Turnaround & delivery</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  Most orders are produced within 2–3 working days once your proof is approved.
                  Delivery and in-store collection options are shown at checkout.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>
    </div>
  );
}
