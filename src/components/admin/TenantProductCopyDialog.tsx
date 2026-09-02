import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useStorefrontPages } from "@/hooks/useStorefrontPages";
import {
  PRODUCT_COPY_SECTIONS,
  DEFAULT_ARTWORK_BODY,
  defaultDeliveryBody,
  defaultSpecsBody,
  useProductCopy,
  useSaveProductCopy,
  type ProductCopyEntry,
  type ProductCopySectionKey,
} from "@/hooks/useProductCopy";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  productFamilyId: string;
  productFamilyName: string;
}

type Draft = Record<ProductCopySectionKey, { title: string; body: string; enabled: boolean }>;

const emptyDraft = (): Draft => ({
  specs: { title: "", body: "", enabled: true },
  artwork: { title: "", body: "", enabled: true },
  delivery: { title: "", body: "", enabled: true },
});

export default function TenantProductCopyDialog({
  open,
  onOpenChange,
  tenantId,
  productFamilyId,
  productFamilyName,
}: Props) {
  const { config } = useStorefrontPages(tenantId);
  const { map, entryFor, isLoading } = useProductCopy(tenantId);
  const save = useSaveProductCopy(tenantId);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  useEffect(() => {
    if (!open) return;
    const entry = entryFor(productFamilyId);
    const next = emptyDraft();
    for (const { key } of PRODUCT_COPY_SECTIONS) {
      next[key] = {
        title: entry[key]?.title ?? "",
        body: entry[key]?.body ?? "",
        enabled: entry[key]?.enabled !== false,
      };
    }
    setDraft(next);
  }, [open, productFamilyId, entryFor]);

  const placeholderBody: Record<ProductCopySectionKey, string> = {
    specs: defaultSpecsBody([]),
    artwork: DEFAULT_ARTWORK_BODY,
    delivery: defaultDeliveryBody(config),
  };

  const update = (key: ProductCopySectionKey, patch: Partial<Draft[ProductCopySectionKey]>) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));

  async function handleSave() {
    const entry: ProductCopyEntry = {};
    for (const { key } of PRODUCT_COPY_SECTIONS) {
      const s = draft[key];
      if (!s.title.trim() && !s.body.trim() && s.enabled) continue; // fully default
      entry[key] = {
        ...(s.title.trim() ? { title: s.title.trim() } : {}),
        ...(s.body.trim() ? { body: s.body.trim() } : {}),
        enabled: s.enabled,
      };
    }
    try {
      await save.mutateAsync({ map, familyId: productFamilyId, entry });
      toast.success("Product page text saved");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save product page text");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{productFamilyName} — Product page text</DialogTitle>
          <DialogDescription>
            Customise the information sections shown on the storefront product page. Leave a field
            blank to use the default wording.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {PRODUCT_COPY_SECTIONS.map(({ key, defaultTitle, hint }) => (
            <div key={key} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{defaultTitle}</p>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`copy-${key}-enabled`} className="text-xs text-muted-foreground">
                    Show on product page
                  </Label>
                  <Switch
                    id={`copy-${key}-enabled`}
                    checked={draft[key].enabled}
                    onCheckedChange={(v) => update(key, { enabled: v })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Heading</Label>
                <Input
                  value={draft[key].title}
                  placeholder={defaultTitle}
                  disabled={!draft[key].enabled}
                  onChange={(e) => update(key, { title: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Body text</Label>
                <Textarea
                  rows={3}
                  value={draft[key].body}
                  placeholder={placeholderBody[key]}
                  disabled={!draft[key].enabled}
                  onChange={(e) => update(key, { body: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">{hint}</p>
              </div>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => update(key, { title: "", body: "", enabled: true })}
              >
                Reset to default
              </Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={save.isPending || isLoading}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
