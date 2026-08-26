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

export default function HeroSection({ config, heroImageUrl, onPrimary, onSecondary }: Props) {
  const image = config.hero_image_url || heroImageUrl || defaultHero.url;
  const full = config.hero_layout === "full";

  const copy = (
    <>
      {config.hero_eyebrow && (
        <p
          className={`mb-3 text-[11px] font-extrabold uppercase tracking-[0.16em] ${
            full ? "text-primary-foreground/90" : "text-primary"
          }`}
        >
          {config.hero_eyebrow}
        </p>
      )}
      <h1 className="sf-hero-title text-foreground">
        {config.hero_heading}
      </h1>
      <p
        className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-foreground/80"
      >
        {config.hero_subcopy}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button size="lg" className="h-12 px-6 text-[15px] font-bold" onClick={onPrimary}>
          {config.hero_cta_primary}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button
          size="lg"
          variant="outline"
           className="h-12 border-2 border-primary bg-background/90 px-6 text-[15px] font-bold text-primary hover:bg-background"
          onClick={onSecondary}
        >
          {config.hero_cta_secondary}
        </Button>
      </div>
    </>
  );

  if (full) {
    return (
      <section className="relative min-h-[350px] overflow-hidden border-b lg:min-h-[420px]">
        <img
          src={image}
          alt={config.hero_heading}
          className="absolute inset-0 h-full w-full object-cover object-center"
          loading="eager"
        />
        <div className="sf-container relative flex min-h-[350px] items-center py-8 lg:min-h-[420px]">
          <div className="max-w-[590px]">{copy}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b bg-background">
      <div className="grid items-stretch lg:grid-cols-[48%_52%]">
        <div className="flex items-center">
           <div className="ml-auto w-full max-w-[680px] px-[6vw] py-9 lg:py-10 lg:pl-[9vw] lg:pr-10">
            {copy}
          </div>
        </div>

        <div className="relative min-h-[260px] bg-muted lg:min-h-[400px]">
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
