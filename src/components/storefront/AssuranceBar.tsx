import {
  Truck,
  Shield,
  Clock,
  Star,
  Package,
  CreditCard,
  Pencil,
  Layers,
  Heart,
  Sparkles,
} from "lucide-react";
import type { StorefrontAssuranceItem } from "@/hooks/useStorefrontPages";

const ICONS: Record<string, React.ElementType> = {
  truck: Truck,
  shield: Shield,
  clock: Clock,
  star: Star,
  package: Package,
  card: CreditCard,
  pencil: Pencil,
  layers: Layers,
  heart: Heart,
  sparkles: Sparkles,
};


/** Thin trust strip that sits above the page content. */
export default function AssuranceBar({ items }: { items: StorefrontAssuranceItem[] }) {
  if (!items.length) return null;
  return (
    <div className="sf-band border-b">
      <div className="sf-container grid grid-cols-2 gap-x-4 gap-y-1.5 py-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-10">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? Shield;
          return (
            <div
              key={item.title}
              className="flex min-w-0 items-center gap-1.5 text-[11px] leading-tight sm:gap-2 sm:text-[13px] sm:leading-none"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 sf-accent" aria-hidden />
              <span className="truncate font-medium text-foreground">{item.title}</span>
              {item.subtitle && (
                <span className="hidden truncate text-muted-foreground sm:inline">· {item.subtitle}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
