import { ArrowRight, FileText } from "lucide-react";
import type { StorefrontFamily } from "@/lib/storefront/catalogue";

export interface StripItem {
  family: StorefrontFamily;
  imageUrl?: string | null;
  fromPriceLabel?: string | null;
}

/** Compact one-row product strip used on the landing page. */
export default function ProductStrip({
  items,
  onSelect,
}: {
  items: StripItem[];
  onSelect: (family: StorefrontFamily) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(({ family, imageUrl, fromPriceLabel }) => (
        <button
          key={family.id}
          type="button"
          onClick={() => onSelect(family)}
          className="group overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md"
        >
          <div className="px-3 pb-2 pt-3">
            <p className="truncate text-[13px] font-semibold text-foreground">{family.name}</p>
          </div>
          <div className="h-24 w-full overflow-hidden bg-muted">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={family.name}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <span className="flex h-full items-center justify-center">
                <FileText className="h-7 w-7 text-muted-foreground/40" aria-hidden />
              </span>
            )}
          </div>
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-[13px] font-semibold sf-accent">
              {fromPriceLabel ? `From ${fromPriceLabel}` : "View"}
            </span>
            <ArrowRight className="h-3.5 w-3.5 sf-accent transition-transform group-hover:translate-x-0.5" />
          </div>
        </button>
      ))}
    </div>
  );
}
