import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Trash2, Upload } from "lucide-react";
import { familyImage } from "@/lib/storefront/productImages";
import { cn } from "@/lib/utils";

type FamilyLike = { id: string; name: string; slug?: string | null; image_url?: string | null };

export type ImagesMap = Record<string, string[]>;

async function uploadStorefrontImage(file: File, tenantId: string): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tenantId}/storefront/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from("tenant-assets")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("tenant-assets").getPublicUrl(path).data.publicUrl;
}

/**
 * Per-product storefront gallery editor.
 *
 * All mutations go through a functional updater so a second upload always
 * appends to the LATEST list — never to a stale snapshot captured when the
 * file input was rendered (which is what silently overwrote earlier images).
 */
export default function ProductGalleryManager({
  tenantId,
  families,
  images,
  onChange,
}: {
  tenantId: string;
  families: FamilyLike[];
  images: ImagesMap;
  onChange: (updater: (prev: ImagesMap) => ImagesMap) => void;
}) {
  const setFamilyImages = (familyId: string, fn: (list: string[]) => string[]) =>
    onChange((prev) => ({ ...prev, [familyId]: fn(prev[familyId] ?? []) }));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Upload storefront images per product. The first image is the cover used on cards; the rest
        become the product-page gallery thumbnails. Without uploads, the built-in product image is
        used. Remember to press Save.
      </p>
      {families.map((f) => (
        <FamilyRow
          key={f.id}
          tenantId={tenantId}
          family={f}
          list={images[f.id] ?? []}
          setList={(fn) => setFamilyImages(f.id, fn)}
        />
      ))}
    </div>
  );
}

function FamilyRow({
  tenantId,
  family,
  list,
  setList,
}: {
  tenantId: string;
  family: FamilyLike;
  list: string[];
  setList: (fn: (list: string[]) => string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const fallback = familyImage(family);

  const handleFiles = async (files: FileList) => {
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const url = await uploadStorefrontImage(file, tenantId);
        setList((prev) => [...prev, url]);
      }
      toast.success(files.length > 1 ? `${files.length} images uploaded` : "Image uploaded");
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const move = (index: number, dir: -1 | 1) =>
    setList((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[180px]">
          <p className="text-sm font-medium text-foreground">{family.name}</p>
          <p className="text-xs text-muted-foreground">{family.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {list.length ? `${list.length} image${list.length > 1 ? "s" : ""}` : "Using default"}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {busy ? "Uploading…" : "Add images"}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {list.map((src, i) => (
          <div
            key={src + i}
            className={cn(
              "relative w-28 overflow-hidden rounded-md border bg-muted",
              i === 0 && "ring-2 ring-primary",
            )}
          >
            <img src={src} alt="" className="h-20 w-full object-cover" loading="lazy" />
            {i === 0 && (
              <Badge className="absolute left-1 top-1 px-1.5 py-0 text-[10px]">Cover</Badge>
            )}
            <button
              type="button"
              aria-label="Remove image"
              className="absolute right-1 top-1 rounded-full border bg-background p-0.5"
              onClick={() => setList((prev) => prev.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3 w-3" />
            </button>
            <div className="flex items-center justify-between border-t bg-background/90">
              <button
                type="button"
                aria-label="Move left"
                disabled={i === 0}
                className="p-1 disabled:opacity-30"
                onClick={() => move(i, -1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[10px] text-muted-foreground">{i + 1}</span>
              <button
                type="button"
                aria-label="Move right"
                disabled={i === list.length - 1}
                className="p-1 disabled:opacity-30"
                onClick={() => move(i, 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {!list.length && fallback && (
          <div className="w-28 overflow-hidden rounded-md border bg-muted opacity-70">
            <img src={fallback} alt="" className="h-20 w-full object-cover" loading="lazy" />
            <p className="border-t bg-background/90 py-0.5 text-center text-[10px] text-muted-foreground">
              Default
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
