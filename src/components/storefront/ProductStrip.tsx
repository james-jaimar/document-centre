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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(({ family, imageUrl, fromPriceLabel }) => (
        <button
          key={family.id}
          type="button"
          onClick={() => onSelect(family)}
          className="group flex min-h-[214px] flex-col rounded-lg border bg-card px-3 py-2.5 text-left transition-shadow hover:shadow-sm"
        >
          <p className="mb-2 truncate text-center text-[13px] font-bold text-foreground">
            {family.name}
          </p>
          <div className="h-[132px] w-full overflow-hidden rounded-md">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={family.name}
                className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <span className="flex h-full items-center justify-center">
                <FileText className="h-7 w-7 text-muted-foreground/40" aria-hidden />
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between">
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
