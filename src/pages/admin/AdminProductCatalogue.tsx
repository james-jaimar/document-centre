import { useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import {
  useTenantProductToggles,
  useSetTenantProductToggle,
  buildDisabledFamilySet,
} from "@/hooks/useTenantProductToggles";
import { useProductPriceOverrides } from "@/hooks/useProductPriceOverrides";
import {
  useTenantBranchCapabilitySummary,
  useEnableFamilyOnTenantBranches,
} from "@/hooks/useTenantBranchCapabilitySummary";
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
import { Images, Settings2, SlidersHorizontal, Store } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import TenantProductSpecsDialog from "@/components/admin/TenantProductSpecsDialog";
import ArtworkTemplatesTab from "@/components/admin/ArtworkTemplatesTab";

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

  const { data: branchSummary } = useTenantBranchCapabilitySummary(tenantId);
  const enableOnBranches = useEnableFamilyOnTenantBranches();

  const disabled = buildDisabledFamilySet(toggles);
  const [openFamilyId, setOpenFamilyId] = useState<string | null>(null);
  const [openFamilyName, setOpenFamilyName] = useState<string>("");
  const [openFamilySlug, setOpenFamilySlug] = useState<string>("");
  const [specsFamilyId, setSpecsFamilyId] = useState<string | null>(null);
  const [specsFamilyName, setSpecsFamilyName] = useState<string>("");
  const [artworkFamilyId, setArtworkFamilyId] = useState<string | null>(null);
  const [artworkFamilyName, setArtworkFamilyName] = useState<string>("");



  async function handleToggle(familyId: string, next: boolean) {
    if (!tenantId) return;
    try {
      await setToggle.mutateAsync({
        tenant_id: tenantId,
        product_family_id: familyId,
        is_enabled: next,
      });
      // Turning a product ON at tenant level should reach the storefront:
      // enable it on branches that have never been set explicitly.
      if (next) {
        await enableOnBranches.mutateAsync({
          tenant_id: tenantId,
          product_family_id: familyId,
          only_untouched: true,
        });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  async function handleEnableAllBranches(familyId: string, familyName: string) {
    if (!tenantId) return;
    try {
      const n = await enableOnBranches.mutateAsync({
        tenant_id: tenantId,
        product_family_id: familyId,
      });
      toast({
        title: "Branches updated",
        description: `${familyName} enabled on ${n} branch${n === 1 ? "" : "es"}.`,
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
                <TableHead className="w-56">Actions</TableHead>
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
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSpecsFamilyId(f.id);
                            setSpecsFamilyName(f.name);
                          }}
                        >
                          <SlidersHorizontal className="h-3 w-3 mr-1" />
                          Specs
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setOpenFamilyId(f.id);
                            setOpenFamilyName(f.name);
                            setOpenFamilySlug(f.slug);
                          }}
                        >
                          <Settings2 className="h-3 w-3 mr-1" />
                          Pricing
                        </Button>
                        {f.supports_editable_artwork && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setArtworkFamilyId(f.id);
                              setArtworkFamilyName(f.name);
                            }}
                          >
                            <Images className="h-3 w-3 mr-1" />
                            Templates
                          </Button>
                        )}
                      </div>
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
              productFamilySlug={openFamilySlug}
            />
          )}
        </DialogContent>
      </Dialog>

      {tenantId && specsFamilyId && (
        <TenantProductSpecsDialog
          open={!!specsFamilyId}
          onOpenChange={(o) => { if (!o) setSpecsFamilyId(null); }}
          tenantId={tenantId}
          productFamilyId={specsFamilyId}
          productFamilyName={specsFamilyName}
        />
      )}

      <Dialog
        open={!!artworkFamilyId}
        onOpenChange={(o) => { if (!o) setArtworkFamilyId(null); }}
      >
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{artworkFamilyName} — Customer templates</DialogTitle>
          </DialogHeader>
          {tenantId && artworkFamilyId && (
            <ArtworkTemplatesTab productFamilyId={artworkFamilyId} tenantId={tenantId} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminProductCatalogue;
