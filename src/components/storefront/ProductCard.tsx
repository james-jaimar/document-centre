import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Wand2, Upload } from "lucide-react";
import type { StorefrontFamily } from "@/lib/storefront/catalogue";
import { isEditableFamily } from "@/lib/storefront/catalogue";

interface Props {
  family: StorefrontFamily;
  imageUrl?: string | null;
  fromPriceLabel?: string | null;
  turnaround?: string | null;
  onView: () => void;
  onStart: () => void;
}

export default function ProductCard({
  family,
  imageUrl,
  fromPriceLabel,
  turnaround,
  onView,
  onStart,
}: Props) {
  const editable = isEditableFamily(family);
  return (
    <Card className="group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-lg">
      <button
        type="button"
        onClick={onView}
        className="relative block h-40 w-full overflow-hidden bg-muted text-left"
        aria-label={`View ${family.name}`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={family.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full items-center justify-center">
            <FileText className="h-10 w-10 text-muted-foreground/50" aria-hidden />
          </span>
        )}
        {fromPriceLabel && (
          <span className="absolute right-3 top-3 rounded-full bg-background/95 px-2.5 py-1 text-xs font-semibold shadow-sm">
            From {fromPriceLabel}
          </span>
        )}
      </button>

      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-tight text-foreground">{family.name}</h3>
          <Badge variant={editable ? "default" : "secondary"} className="shrink-0 gap-1 text-[11px]">
            {editable ? <Wand2 className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
            {editable ? "Customise online" : "Upload artwork"}
          </Badge>
        </div>

        {family.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{family.description}</p>
        )}

        {turnaround && <p className="text-xs text-muted-foreground">{turnaround}</p>}

        <div className="mt-auto flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={onView}>
            View details
          </Button>
          <Button size="sm" className="flex-1" onClick={onStart}>
            {editable ? "Start designing" : "Upload artwork"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
