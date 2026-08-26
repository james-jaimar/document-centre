import { Button } from "@/components/ui/button";
import { FileText, Truck, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StorefrontFamily } from "@/lib/storefront/catalogue";
import { isEditableFamily } from "@/lib/storefront/catalogue";

interface Props {
  family: StorefrontFamily;
  imageUrl?: string | null;
  fromPriceLabel?: string | null;
  turnaround?: string | null;
  view?: "grid" | "list";
  onView: () => void;
  onStart: () => void;
}

export default function ProductCard({
  family,
  imageUrl,
  fromPriceLabel,
  turnaround,
  view = "grid",
  onView,
  onStart,
}: Props) {
  const editable = isEditableFamily(family);
  const pill = editable ? "Customise online" : "Upload artwork";

  const media = (
    <button
      type="button"
      onClick={onView}
      className={cn(
        "group relative block overflow-hidden bg-muted text-left",
        view === "grid" ? "h-44 w-full" : "h-full w-48 shrink-0",
      )}
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
          <FileText className="h-9 w-9 text-muted-foreground/40" aria-hidden />
        </span>
      )}
      <span
        className={cn(
          "absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold",
          editable ? "sf-accent-bg" : "sf-info-soft",
        )}
      >
        {pill}
      </span>
    </button>
  );

  const body = (
    <div className="flex flex-1 flex-col p-4">
      <h3 className="text-[15px] font-semibold leading-snug text-foreground">{family.name}</h3>
      {family.description && (
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {family.description}
        </p>
      )}
      {turnaround && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Truck className="h-3.5 w-3.5" aria-hidden />
          {turnaround}
        </p>
      )}
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="leading-tight">
          {fromPriceLabel ? (
            <>
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                From
              </span>
              <span className="text-lg font-bold sf-accent">{fromPriceLabel}</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Price on configuration</span>
          )}
        </div>
        <Button size="sm" onClick={onStart} className="shrink-0">
          {editable ? "Start designing" : "Upload artwork"}
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <article
      className={cn(
        "flex overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md",
        view === "grid" ? "h-full flex-col" : "flex-row",
      )}
    >
      {media}
      {body}
    </article>
  );
}
