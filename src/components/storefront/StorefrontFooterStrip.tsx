import { Lock, CreditCard, LifeBuoy } from "lucide-react";

const ICONS = [Lock, CreditCard, LifeBuoy];

export default function StorefrontFooterStrip({
  items,
  note,
}: {
  items: string[];
  note?: string;
}) {
  if (!items.length && !note) return null;
  return (
    <div className="sf-band border-t">
      <div className="sf-container flex flex-col items-center gap-2 py-5">
        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            {items.map((item, i) => {
              const Icon = ICONS[i % ICONS.length];
              return (
                <span
                  key={item}
                  className="flex items-center gap-2 text-[13px] text-muted-foreground"
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {item}
                </span>
              );
            })}
          </div>
        )}
        {note && <p className="text-center text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}
