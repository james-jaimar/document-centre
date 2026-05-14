import { useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import {
  useTenantProductToggles,
  useSetTenantProductToggle,
  buildDisabledFamilySet,
} from "@/hooks/useTenantProductToggles";
import { useProductPriceOverrides } from "@/hooks/useProductPriceOverrides";
import ProductPricingTab from "@/components/admin/ProductPricingTab";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Settings2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const AdminProductCatalogue = () => {
  const { tenantId } = useTenantContext();
  const { data: families = [], isLoading } = useProductFamilies(tenantId, {
    masterOnly: true,
  });
  const { data: toggles = [] } = useTenantProductToggles(tenantId);
  const setToggle = useSetTenantProductToggle();
  const { data: tenantOverrides = [] } = useProductPriceOverrides(
    tenantId,
    null,
    "ZAR",
    null,
  );

  const disabled = buildDisabledFamilySet(toggles);
  const [openFamilyId, setOpenFamilyId] = useState<string | null>(null);
  const [openFamilyName, setOpenFamilyName] = useState<string>("");
  const [openFamilySlug, setOpenFamilySlug] = useState<string>("");

  async function handleToggle(familyId: string, next: boolean) {
    if (!tenantId) return;
    try {
      await setToggle.mutateAsync({
        tenant_id: tenantId,
        product_family_id: familyId,
        is_enabled: next,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  const overrideCounts = tenantOverrides.reduce<Record<string, number>>(
    (acc, o) => {
      acc[o.product_family_id] = (acc[o.product_family_id] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Products</h1>
        <p className="text-sm text-muted-foreground">
          The platform master catalogue. Toggle which products your tenant
          offers and override prices where needed.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : families.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No master products available yet.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tenant Enabled</TableHead>
                <TableHead>Price Overrides</TableHead>
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {families.map((f) => {
                const isEnabled = !disabled.has(f.id);
                const oc = overrideCounts[f.id] ?? 0;
                return (
                  <TableRow key={f.id}>
                    <TableCell>{f.sort_order}</TableCell>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {f.slug}
                    </TableCell>
                    <TableCell>
                      <Badge variant={f.is_active ? "default" : "secondary"}>
                        {f.is_active ? "Master Active" : "Master Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={isEnabled}
                        disabled={!f.is_active || setToggle.isPending}
                        onCheckedChange={(v) => handleToggle(f.id, v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{oc} override{oc !== 1 ? "s" : ""}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setOpenFamilyId(f.id);
                          setOpenFamilyName(f.name);
                        }}
                      >
                        <Settings2 className="h-3 w-3 mr-1" />
                        Pricing
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={!!openFamilyId}
        onOpenChange={(o) => {
          if (!o) setOpenFamilyId(null);
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{openFamilyName} — Pricing</DialogTitle>
          </DialogHeader>
          {openFamilyId && (
            <ProductPricingTab
              productFamilyId={openFamilyId}
              productFamilyName={openFamilyName}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminProductCatalogue;
