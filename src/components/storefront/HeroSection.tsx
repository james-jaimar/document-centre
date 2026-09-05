import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { StorefrontPagesConfig } from "@/hooks/useStorefrontPages";
import defaultHero from "@/assets/storefront-hero.jpg.asset.json";

interface Props {
  config: StorefrontPagesConfig;
  heroImageUrl?: string | null;
  onPrimary: () => void;
  onSecondary: () => void;
}

const HEIGHTS: Record<string, string> = {
  standard: "min-h-[350px] lg:min-h-[420px]",
  tall: "min-h-[420px] lg:min-h-[560px]",
  screen: "min-h-[480px] lg:min-h-[calc(100vh-160px)]",
};

export default function HeroSection({ config, heroImageUrl, onPrimary, onSecondary }: Props) {
  const image = config.hero_image_url || heroImageUrl || defaultHero.url;
  const full = config.hero_layout === "full";
  const height = HEIGHTS[config.hero_height] ?? HEIGHTS.standard;
  const align = config.hero_align ?? "left";
  const specs = config.hero_spec_items ?? [];

  const copy = (
    <>
      {config.hero_eyebrow && (
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">
          {config.hero_eyebrow}
        </p>
      )}
      <h1 className="sf-hero-title text-foreground">{config.hero_heading}</h1>
      <p className="mt-4 max-w-[44ch] text-[15px] leading-relaxed text-foreground/80">
        {config.hero_subcopy}
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-5">
        <Button
          size="lg"
          className="h-12 rounded-none px-7 text-[12px] font-bold uppercase tracking-[0.12em]"
          onClick={onPrimary}
        >
          {config.hero_cta_primary}
        </Button>

        {config.hero_cta_secondary &&
          (config.hero_secondary_style === "link" ? (
            <button
              type="button"
              onClick={onSecondary}
              className="group flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground"
            >
              {config.hero_cta_secondary}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          ) : (
            <Button
              size="lg"
              variant="outline"
              className="h-12 rounded-none border-2 border-primary bg-background/90 px-7 text-[12px] font-bold uppercase tracking-[0.12em] text-primary hover:bg-background"
              onClick={onSecondary}
            >
              {config.hero_cta_secondary}
            </Button>
          ))}
      </div>

      {specs.length > 0 && (
        <ul
          className={`mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 ${
            align === "center" ? "justify-center" : ""
          }`}
        >
          {specs.map((spec, i) => (
            <li
              key={spec}
              className={`text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/70 ${
                i ? "border-l pl-5" : ""
              }`}
            >
              {spec}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (full) {
    const place =
      align === "center"
        ? "justify-center text-center"
        : align === "right"
          ? "justify-end"
          : "justify-start";
    return (
      <section className={`relative overflow-hidden border-b ${height}`}>
        <img
          src={image}
          alt={config.hero_heading}
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="eager"
        />
        <div className={`sf-container relative flex items-center py-10 ${height}`}>
          <div className={`flex w-full ${place}`}>
            <div className="max-w-[560px]">{copy}</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b bg-background">
      <div className="grid items-stretch lg:grid-cols-[48%_52%]">
        <div className="flex items-center">
          <div className="ml-auto w-full max-w-[680px] px-[6vw] py-10 lg:pl-[9vw] lg:pr-10">
            {copy}
          </div>
        </div>

        <div className={`relative bg-muted ${height}`}>
          <img
            src={image}
            alt={config.hero_heading}
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
          />
        </div>
      </div>
    </section>
  );
}
