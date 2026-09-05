import type { StorefrontSizeCompare } from "@/hooks/useStorefrontPages";

/**
 * Editorial "why bigger matters" band: a short pitch on the left and
 * proportionally sized outlined size chips on the right.
 *
 * Chip widths are percentages of the row (never fixed pixels) so the band can
 * shrink onto a phone screen without forcing the page wider than the viewport.
 */
export default function SizeCompare({ data }: { data: StorefrontSizeCompare }) {
  const items = data.items ?? [];
  if (!data.heading && !items.length) return null;

  const max = Math.max(1, ...items.map((i) => i.scale || 1));
  const ratios = items.map((i) => Math.max(0.35, (i.scale || 1) / max));
  const total = ratios.reduce((a, b) => a + b, 0) || 1;

  return (
    <section className="py-8 sm:py-12 lg:py-16">
      <div className="sf-container grid items-center gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
        <div>
          {data.heading && (
            <h2 className="sf-display text-[clamp(1.4rem,7vw,2.5rem)] uppercase leading-[1.12]">
              {data.heading}
            </h2>
          )}
          <span className="mt-4 block h-[3px] w-10 max-w-[12%] bg-[hsl(var(--sf-blue))] sm:max-w-none" aria-hidden />
          {data.body && (
            <p className="mt-4 max-w-[46ch] text-[14px] leading-relaxed text-foreground/75">
              {data.body}
            </p>
          )}
        </div>

        {items.length > 0 && (
          <ul className="flex w-full min-w-0 items-end justify-start gap-2 sm:gap-4 lg:justify-end">
            {items.map((item, i) => {
              const pct = (ratios[i] / total) * 100;
              return (
                <li
                  key={`${item.label}-${item.dimensions}`}
                  className={`flex min-w-0 flex-col items-center justify-center border p-1 text-center ${
                    item.highlight
                      ? "border-[hsl(var(--sf-blue))] text-[hsl(var(--sf-blue))]"
                      : "border-border text-foreground"
                  }`}
                  style={{
                    flex: `0 1 ${pct}%`,
                    maxWidth: `${pct}%`,
                    aspectRatio: "1 / 1.32",
                  }}
                >
                  <span className="sf-display text-[clamp(0.85rem,3.4vw,1.6rem)] leading-tight">
                    {item.label}
                  </span>
                  {item.dimensions && (
                    <span className="mt-1 text-[clamp(0.55rem,2vw,0.7rem)] leading-tight tracking-wide">
                      {item.dimensions}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
