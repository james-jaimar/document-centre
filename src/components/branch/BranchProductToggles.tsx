import { useState } from "react";
import { useBranchCapabilities, useUpdateBranchCapability, useSeedBranchCapabilities } from "@/hooks/useBranchCapabilities";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ProductPricingTab from "@/components/admin/ProductPricingTab";
import BranchProductSpecsDialog from "@/components/branch/BranchProductSpecsDialog";
import { toast } from "sonner";
import { ChevronDown, Package, AlertTriangle, RefreshCw, ToggleLeft, ToggleRight, Tag, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BranchCapability } from "@/hooks/useBranchCapabilities";

interface Props {
  branchId: string;
  readOnly?: boolean;
}

export default function BranchProductToggles({ branchId, readOnly = false }: Props) {
  const { data: capabilities, isLoading } = useBranchCapabilities(branchId);
  const update = useUpdateBranchCapability();
  const seed = useSeedBranchCapabilities();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pricingFamily, setPricingFamily] = useState<{ id: string; name: string; slug?: string } | null>(null);
  const [specsFamily, setSpecsFamily] = useState<{ id: string; name: string } | null>(null);

  const handleToggle = async (cap: BranchCapability, field: keyof BranchCapability, value: unknown) => {
    try {
      await update.mutateAsync({ id: cap.id, [field]: value });
      toast.success(`Updated ${cap.product_families?.name || "product"}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleBulkToggle = async (enabled: boolean) => {
    if (!capabilities?.length) return;
    try {
      for (const cap of capabilities) {
        await update.mutateAsync({ id: cap.id, is_enabled: enabled });
      }
      toast.success(enabled ? "All products enabled" : "All products disabled");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSeed = async () => {
    try {
      await seed.mutateAsync(branchId);
      toast.success("Product capabilities seeded");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading capabilities…</div>;
  }

  if (!capabilities?.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-4">
          <p className="text-muted-foreground">No product capabilities configured yet.</p>
          {!readOnly && (
            <Button onClick={handleSeed} disabled={seed.isPending}>
              <RefreshCw size={14} className={cn("mr-1.5", seed.isPending && "animate-spin")} />
              {seed.isPending ? "Seeding…" : "Seed All Products"}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={handleSeed} disabled={seed.isPending}>
            <RefreshCw size={14} className={cn("mr-1.5", seed.isPending && "animate-spin")} />
            Sync Products
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleBulkToggle(true)}>
            <ToggleRight size={14} className="mr-1.5" /> Enable All
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleBulkToggle(false)}>
            <ToggleLeft size={14} className="mr-1.5" /> Disable All
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {capabilities.map((cap) => {
          const isExpanded = expandedId === cap.id;
          return (
            <Collapsible key={cap.id} open={isExpanded} onOpenChange={(o) => setExpandedId(o ? cap.id : null)}>
              <Card className={cn(
                "transition-colors",
                !cap.is_enabled && "opacity-60",
                cap.temporary_outage && "border-destructive/50"
              )}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Package size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{cap.product_families?.name || "Unknown"}</span>
                      {cap.temporary_outage && (
                        <Badge variant="destructive" className="text-xs gap-1">
                          <AlertTriangle size={10} /> Outage
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {cap.supports_color ? "Color" : "B&W"} · {cap.min_pages}–{cap.max_pages} pages · Qty {cap.min_quantity}–{cap.max_quantity}
                    </p>
                  </div>
                  <Switch
                    checked={cap.is_enabled}
                    onCheckedChange={(v) => handleToggle(cap, "is_enabled", v)}
                    disabled={readOnly || update.isPending}
                  />
                  {!readOnly && cap.product_family_id && cap.product_families?.name && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setSpecsFamily({ id: cap.product_family_id!, name: cap.product_families!.name })}
                      >
                        <Sliders size={12} className="mr-1.5" /> Specs
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => setPricingFamily({ id: cap.product_family_id!, name: cap.product_families!.name, slug: cap.product_families!.slug })}
                      >
                        <Tag size={12} className="mr-1.5" /> Pricing
                      </Button>
                    </>
                  )}
                  {!readOnly && (
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ChevronDown size={14} className={cn("transition-transform", isExpanded && "rotate-180")} />
                      </Button>
                    </CollapsibleTrigger>
                  )}
                </div>

                <CollapsibleContent>
                  <CardContent className="border-t pt-4 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex items-center gap-3">
                        <Switch
                          id={`color-${cap.id}`}
                          checked={cap.supports_color}
                          onCheckedChange={(v) => handleToggle(cap, "supports_color", v)}
                          disabled={readOnly}
                        />
                        <Label htmlFor={`color-${cap.id}`}>Supports Color Printing</Label>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          id={`outage-${cap.id}`}
                          checked={cap.temporary_outage}
                          onCheckedChange={(v) => handleToggle(cap, "temporary_outage", v)}
                          disabled={readOnly}
                        />
                        <Label htmlFor={`outage-${cap.id}`}>Temporary Outage</Label>
                      </div>
                    </div>

                    {cap.temporary_outage && (
                      <div className="max-w-xs">
                        <Label htmlFor={`outage-until-${cap.id}`}>Outage Until</Label>
                        <Input
                          id={`outage-until-${cap.id}`}
                          type="date"
                          value={cap.outage_until?.split("T")[0] || ""}
                          onChange={(e) => handleToggle(cap, "outage_until", e.target.value ? new Date(e.target.value).toISOString() : null)}
                          disabled={readOnly}
                        />
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Page Range</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            type="number"
                            value={cap.min_pages ?? 1}
                            onChange={(e) => handleToggle(cap, "min_pages", parseInt(e.target.value) || 1)}
                            className="w-24"
                            disabled={readOnly}
                          />
                          <span className="text-muted-foreground">to</span>
                          <Input
                            type="number"
                            value={cap.max_pages ?? 5000}
                            onChange={(e) => handleToggle(cap, "max_pages", parseInt(e.target.value) || 5000)}
                            className="w-24"
                            disabled={readOnly}
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Quantity Range</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            type="number"
                            value={cap.min_quantity ?? 1}
                            onChange={(e) => handleToggle(cap, "min_quantity", parseInt(e.target.value) || 1)}
                            className="w-24"
                            disabled={readOnly}
                          />
                          <span className="text-muted-foreground">to</span>
                          <Input
                            type="number"
                            value={cap.max_quantity ?? 10000}
                            onChange={(e) => handleToggle(cap, "max_quantity", parseInt(e.target.value) || 10000)}
                            className="w-24"
                            disabled={readOnly}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>

      <Dialog open={!!pricingFamily} onOpenChange={(o) => !o && setPricingFamily(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pricingFamily?.name} — Branch Pricing</DialogTitle>
          </DialogHeader>
          {pricingFamily && (
            <ProductPricingTab
              productFamilyId={pricingFamily.id}
              productFamilyName={pricingFamily.name}
              productFamilySlug={pricingFamily.slug ?? null}
              branchId={branchId}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
