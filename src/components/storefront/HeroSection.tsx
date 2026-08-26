import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { StorefrontPagesConfig } from "@/hooks/useStorefrontPages";

interface Props {
  config: StorefrontPagesConfig;
  heroImageUrl?: string | null;
  onPrimary: () => void;
  onSecondary: () => void;
}

export default function HeroSection({ config, heroImageUrl, onPrimary, onSecondary }: Props) {
  return (
    <section className="border-b bg-background">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-14 md:grid-cols-2 md:py-20">
        <div className="space-y-5">
          {config.hero_eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {config.hero_eyebrow}
            </p>
          )}
          <h1 className="text-4xl font-bold leading-tight text-foreground md:text-5xl">
            {config.hero_heading}
          </h1>
          <p className="max-w-xl text-base text-muted-foreground md:text-lg">
            {config.hero_subcopy}
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button size="lg" onClick={onPrimary}>
              {config.hero_cta_primary}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={onSecondary}>
              {config.hero_cta_secondary}
            </Button>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl border bg-muted">
          {heroImageUrl ? (
            <img
              src={heroImageUrl}
              alt={config.hero_heading}
              className="h-full w-full object-cover"
              loading="eager"
            />
          ) : (
            <div className="aspect-[4/3] w-full bg-gradient-to-br from-primary/15 via-primary/5 to-accent/20" />
          )}
        </div>
      </div>
    </section>
  );
}
