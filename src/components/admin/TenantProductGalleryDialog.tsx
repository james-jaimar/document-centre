import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ProductGalleryManager, { type ImagesMap } from "./ProductGalleryManager";
import {
  useSaveStorefrontPages,
  useStorefrontPages,
  STOREFRONT_PAGES_DEFAULTS,
  type StorefrontPagesConfig,
} from "@/hooks/useStorefrontPages";

export default function TenantProductGalleryDialog({
  open,
  onOpenChange,
  tenantId,
  family,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tenantId: string;
  family: { id: string; name: string; slug?: string | null; image_url?: string | null };
}) {
  const { config, isFetched } = useStorefrontPages(tenantId);
  const save = useSaveStorefrontPages(tenantId);
  const [draft, setDraft] = useState<StorefrontPagesConfig>(STOREFRONT_PAGES_DEFAULTS);

  useEffect(() => {
    if (isFetched && open) setDraft(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFetched, open, tenantId]);

  const handleSave = () =>
    save.mutate(draft, {
      onSuccess: () => {
        toast.success("Product images saved");
        onOpenChange(false);
      },
      onError: (e: any) => toast.error(e?.message ?? "Could not save"),
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{family.name} — Storefront images</DialogTitle>
        </DialogHeader>
        <ProductGalleryManager
          tenantId={tenantId}
          families={[family]}
          images={(draft.images ?? {}) as ImagesMap}
          onChange={(updater) =>
            setDraft((d) => ({ ...d, images: updater(d.images ?? {}) }))
          }
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save images"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
