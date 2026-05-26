import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProductOptions } from "@/hooks/useProductOptions";
import {
  useBranchProductOptionOverrides,
  useSetBranchProductOptionOverride,
} from "@/hooks/useBranchProductOptionOverrides";
import {
  isStructuredValues,
  type StructuredOptionValue,
} from "@/lib/productOptionTypes";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId: string;
  productFamilyId: string;
  productFamilyName: string;
}

export default function BranchProductSpecsDialog({
  open,
  onOpenChange,
  branchId,
  productFamilyId,
  productFamilyName,
}: Props) {
  const { data: options = [], isLoading } = useProductOptions(productFamilyId);
  const { data: overrides = [] } = useBranchProductOptionOverrides(branchId);
  const setOverride = useSetBranchProductOptionOverride();

  const disabledMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const o of overrides) {
      m.set(`${o.product_option_id}::${o.value_slug}`, o.is_enabled);
    }
    return m;
  }, [overrides]);

  const isValueEnabled = (optionId: string, slug: string) => {
    const v = disabledMap.get(`${optionId}::${slug}`);
    return v === undefined ? true : v;
  };

  const handleToggle = async (
    optionId: string,
    slug: string,
    next: boolean,
  ) => {
    try {
      await setOverride.mutateAsync({
        branch_id: branchId,
        product_option_id: optionId,
        value_slug: slug,
        is_enabled: next,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    }
  };

  const structured = options.filter((o) => isStructuredValues(o.values));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{productFamilyName} — Specs available at this branch</DialogTitle>
          <DialogDescription>
            Untick anything this branch doesn't offer. Customers ordering from this
            storefront won't see disabled specs.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading specs…</p>
        ) : structured.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This product has no per-spec values to toggle. To restrict paper or
            finishing items (e.g. binding types, lamination), use the Branch Rate
            Card.
          </p>
        ) : (
          <div className="space-y-4">
            {structured.map((opt) => {
              const values = opt.values as unknown as StructuredOptionValue[];
              return (
                <Card key={opt.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      {opt.name}
                      {opt.is_required && (
                        <Badge variant="secondary" className="text-xs">Required</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {values.map((v) => {
                      const masterActive = v.is_active !== false;
                      const enabled = masterActive && isValueEnabled(opt.id, v.slug);
                      return (
                        <div
                          key={v.slug}
                          className="flex items-center justify-between gap-3 rounded-md border border-border p-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{v.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {v.slug}
                              {!masterActive && " · disabled by tenant"}
                            </div>
                          </div>
                          <Switch
                            checked={enabled}
                            disabled={!masterActive || setOverride.isPending}
                            onCheckedChange={(c) =>
                              handleToggle(opt.id, v.slug, c)
                            }
                          />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
