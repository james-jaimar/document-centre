/**
 * Platform-admin: copy an artwork template into another tenant (or one of
 * that tenant's branches). The copy is independent — its own row, its own
 * base PDF/thumbnail and its own placeholder boxes.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenants } from "@/hooks/useTenants";
import { useBranches } from "@/hooks/useBranches";
import { useProductFamilies } from "@/hooks/useProductFamilies";
import { useCopyArtworkTemplate } from "@/hooks/useArtworkTemplates";
import type { ArtworkTemplate } from "@/lib/artworkTemplates/types";

const WHOLE_TENANT = "__tenant__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ArtworkTemplate;
  /** Tenant currently being administered — excluded is NOT required, copying
   *  into the same tenant's branch is a valid use. */
  sourceTenantId: string;
}

export default function CopyArtworkTemplateDialog({
  open,
  onOpenChange,
  template,
  sourceTenantId,
}: Props) {
  const { data: tenants = [], isLoading: tenantsLoading } = useTenants();
  const [tenantId, setTenantId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>(WHOLE_TENANT);
  const [name, setName] = useState(template.name);
  const { data: branches = [] } = useBranches(tenantId || null);
  const { data: families = [] } = useProductFamilies(tenantId || null);
  const copy = useCopyArtworkTemplate();

  useEffect(() => {
    if (open) {
      setTenantId("");
      setBranchId(WHOLE_TENANT);
      setName(`${template.name} (copy)`);
    }
  }, [open, template.name]);

  useEffect(() => {
    setBranchId(WHOLE_TENANT);
  }, [tenantId]);

  /** The destination must sell the same product family. Master families
   *  (tenant_id null) are available to everyone. */
  const familyAvailable = useMemo(() => {
    if (!tenantId) return true;
    return families.some((f) => f.id === template.product_family_id);
  }, [families, tenantId, template.product_family_id]);

  const handleCopy = async () => {
    if (!tenantId) {
      toast.error("Choose a destination tenant.");
      return;
    }
    try {
      const res = await copy.mutateAsync({
        source: template,
        tenantId,
        branchId: branchId === WHOLE_TENANT ? null : branchId,
        name,
      });
      if (res.warnings.length > 0) {
        toast.warning(
          `Copied as a draft — some files could not be duplicated: ${res.warnings.join(" ")}`,
        );
      } else {
        toast.success(
          `Copied "${name}" with ${res.boxCount} box${res.boxCount === 1 ? "" : "es"}.`,
        );
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not copy the template.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy “{template.name}”</DialogTitle>
          <DialogDescription>
            Creates an independent copy of this layout — base artwork and all placeholder boxes —
            in the destination you choose. The original is untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Destination tenant</Label>
            <Select value={tenantId} onValueChange={setTenantId} disabled={tenantsLoading}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a tenant" />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.id === sourceTenantId ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Scope</Label>
            <Select value={branchId} onValueChange={setBranchId} disabled={!tenantId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_TENANT}>Whole tenant (all branches)</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Name of the copy</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {tenantId && !familyAvailable && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              This tenant does not have the product this layout belongs to. Add the product there
              first, otherwise customers will never see the copy.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            The copy keeps its {template.status === "published" ? "published" : "draft"} state.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCopy} disabled={!tenantId || copy.isPending}>
            {copy.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Copy template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
