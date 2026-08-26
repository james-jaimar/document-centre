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
      <h1 className={`sf-hero-title ${full ? "text-primary-foreground" : "text-foreground"}`}>
        {config.hero_heading}
      </h1>
      <p
        className={`mt-4 max-w-[44ch] text-[15px] leading-relaxed ${
          full ? "text-primary-foreground/85" : "text-muted-foreground"
        }`}
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
          className={`h-12 border-2 px-6 text-[15px] font-bold ${
            full
              ? "border-primary-foreground bg-transparent text-primary-foreground hover:bg-primary-foreground hover:text-foreground"
              : "border-primary text-primary"
          }`}
          onClick={onSecondary}
        >
          {config.hero_cta_secondary}
        </Button>
      </div>
    </>
  );

  if (full) {
    return (
      <section className="relative border-b">
        <img
          src={image}
          alt={config.hero_heading}
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/85 via-foreground/60 to-foreground/20" />
        <div className="sf-container relative flex min-h-[340px] items-center py-12 lg:min-h-[460px]">
          <div className="max-w-[620px]">{copy}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b bg-background">
      <div className="grid items-stretch lg:grid-cols-[48%_52%]">
        <div className="flex items-center">
          <div className="ml-auto w-full max-w-[680px] px-[6vw] py-10 lg:py-12 lg:pl-[9vw] lg:pr-10">
            {copy}
          </div>
        </div>

        <div className="relative min-h-[260px] bg-muted lg:min-h-[420px]">
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
