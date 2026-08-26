import { Truck, Shield, Clock, Star, Package, CreditCard } from "lucide-react";
import type { StorefrontAssuranceItem } from "@/hooks/useStorefrontPages";

const ICONS: Record<string, React.ElementType> = {
  truck: Truck,
  shield: Shield,
  clock: Clock,
  star: Star,
  package: Package,
  card: CreditCard,
};

/** Thin trust strip that sits above the page content. */
export default function AssuranceBar({ items }: { items: StorefrontAssuranceItem[] }) {
  if (!items.length) return null;
  return (
    <div className="sf-band border-b">
      <div className="sf-container flex flex-wrap items-center justify-center gap-x-10 gap-y-1.5 py-2">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? Shield;
          return (
            <div key={item.title} className="flex items-center gap-2 text-[13px] leading-none">
              <Icon className="h-3.5 w-3.5 shrink-0 sf-accent" aria-hidden />
              <span className="font-medium text-foreground">{item.title}</span>
              {item.subtitle && (
                <span className="text-muted-foreground">· {item.subtitle}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
