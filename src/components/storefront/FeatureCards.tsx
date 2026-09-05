import { ArrowRight, ImageIcon } from "lucide-react";
import type { StorefrontFeatureCard } from "@/hooks/useStorefrontPages";

/** Large image-led cards (Desk pads / Planners / Wall calendars). */
export default function FeatureCards({
  cards,
  onSelect,
}: {
  cards: StorefrontFeatureCard[];
  onSelect: (card: StorefrontFeatureCard) => void;
}) {
  if (!cards.length) return null;

  return (
    <section className="pb-8 md:pb-10">
      <div className="sf-container grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.title}
            type="button"
            onClick={() => onSelect(card)}
            className="group flex flex-col overflow-hidden border bg-[hsl(var(--sf-band))] text-left"
          >
            <div className="px-5 pb-4 pt-5 md:px-7 md:pb-6 md:pt-7">
              <h3 className="sf-display text-[clamp(1.05rem,4.4vw,1.5rem)] uppercase leading-tight">
                {card.title}
              </h3>
              <span className="mt-2.5 block h-[3px] w-8 bg-[hsl(var(--sf-blue))]" aria-hidden />
              {card.body && (
                <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-foreground/75 md:mt-4">
                  {card.body}
                </p>
              )}
            </div>

            <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted md:aspect-[4/3]">
              {card.image_url ? (
                <img
                  src={card.image_url}
                  alt={card.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <span className="flex h-full items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/40" aria-hidden />
                </span>
              )}
            </div>

            {card.link_label && (
              <span className="flex items-center gap-2 bg-background px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground md:px-7 md:py-4">
                {card.link_label}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
