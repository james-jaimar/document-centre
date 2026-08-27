/**
 * Slide-out layout picker — vertical thumbnails of every published artwork
 * template so the customer can see a layout before loading it.
 */
import { Check, LayoutTemplate } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSignedThumbnailUrl } from "@/lib/thumbnailUtils";
import { cn } from "@/lib/utils";
import type { ArtworkTemplate } from "@/lib/artworkTemplates/types";

export function TemplateThumb({
  template,
  className,
}: {
  template: ArtworkTemplate;
  className?: string;
}) {
  const url = useSignedThumbnailUrl(template.preview_path ?? null);
  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded border bg-muted/40",
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={`${template.name} layout preview`}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      ) : (
        <LayoutTemplate className="h-6 w-6 text-muted-foreground" />
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templates: ArtworkTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasArtwork?: boolean;
}

export default function TemplatePickerSheet({
  open,
  onOpenChange,
  templates,
  selectedId,
  onSelect,
  hasArtwork,
}: Props) {
  const pick = (id: string) => {
    if (id === selectedId) {
      onOpenChange(false);
      return;
    }
    if (
      hasArtwork &&
      !window.confirm(
        "Switch layout? Your uploaded artwork stays, but boxes that don't exist in the new layout will be dropped.",
      )
    ) {
      return;
    }
    onSelect(id);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[380px] max-w-[90vw] overflow-y-auto p-0 sm:max-w-[380px]">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Choose a layout</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 p-4">
          {templates.map((t) => {
            const active = t.id === selectedId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t.id)}
                className={cn(
                  "block w-full rounded-lg border bg-background p-2 text-left transition hover:border-primary/60",
                  active && "border-primary ring-2 ring-primary/30",
                )}
              >
                <TemplateThumb template={t} className="h-44 w-full" />
                <div className="mt-2 flex items-center gap-2 px-1 pb-1">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.page_count} page{t.page_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
