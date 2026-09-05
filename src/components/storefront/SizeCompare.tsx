import type { StorefrontSizeCompare } from "@/hooks/useStorefrontPages";

/**
 * Editorial "why bigger matters" band: a short pitch on the left and
 * proportionally sized outlined size chips on the right.
 */
export default function SizeCompare({ data }: { data: StorefrontSizeCompare }) {
  const items = data.items ?? [];
  if (!data.heading && !items.length) return null;

  const max = Math.max(1, ...items.map((i) => i.scale || 1));

  return (
    <section className="py-12 lg:py-16">
      <div className="sf-container grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          {data.heading && (
            <h2 className="sf-display text-[clamp(1.75rem,2.6vw,2.5rem)] uppercase leading-[1.1]">
              {data.heading}
            </h2>
          )}
          <span className="mt-4 block h-[3px] w-10 bg-[hsl(var(--sf-blue))]" aria-hidden />
          {data.body && (
            <p className="mt-5 max-w-[46ch] text-[14px] leading-relaxed text-foreground/75">
              {data.body}
            </p>
          )}
        </div>

        {items.length > 0 && (
          <ul className="flex flex-nowrap items-end justify-start gap-4 lg:justify-end">
            {items.map((item) => {
              const ratio = Math.max(0.3, (item.scale || 1) / max);
              return (
                <li
                  key={`${item.label}-${item.dimensions}`}
                  className={`flex shrink flex-col items-center justify-center border text-center ${
                    item.highlight
                      ? "border-[hsl(var(--sf-blue))] text-[hsl(var(--sf-blue))]"
                      : "border-border text-foreground"
                  }`}
                  style={{
                    width: `${Math.round(90 + ratio * 100)}px`,
                    height: `${Math.round(110 + ratio * 160)}px`,
                  }}
                >

                  <span className="sf-display text-[clamp(1.1rem,1.6vw,1.6rem)]">{item.label}</span>
                  {item.dimensions && (
                    <span className="mt-1.5 text-[11px] tracking-wide">{item.dimensions}</span>
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
