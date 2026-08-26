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

export default function AssuranceBar({ items }: { items: StorefrontAssuranceItem[] }) {
  if (!items.length) return null;
  return (
    <div className="border-b bg-muted/40">
      <div className="mx-auto grid max-w-7xl gap-3 px-6 py-3 sm:grid-cols-3">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? Shield;
          return (
            <div key={item.title} className="flex items-center gap-2.5">
              <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <div className="leading-tight">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.subtitle}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
