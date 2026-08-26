import { Button } from "@/components/ui/button";
import { ArrowRight, ImageIcon } from "lucide-react";
import type { StorefrontPagesConfig } from "@/hooks/useStorefrontPages";

interface Props {
  config: StorefrontPagesConfig;
  heroImageUrl?: string | null;
  onPrimary: () => void;
  onSecondary: () => void;
}

export default function HeroSection({ config, heroImageUrl, onPrimary, onSecondary }: Props) {
  const image = config.hero_image_url || heroImageUrl || null;
  return (
    <section className="border-b bg-background">
      <div className="grid items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex items-center">
          <div className="ml-auto w-full max-w-[620px] px-6 py-14 lg:py-20 lg:pr-12">
            {config.hero_eyebrow && (
              <p className="mb-4 inline-flex rounded-full sf-accent-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                {config.hero_eyebrow}
              </p>
            )}
            <h1 className="sf-hero-title text-foreground">{config.hero_heading}</h1>
            <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-muted-foreground">
              {config.hero_subcopy}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button size="lg" className="h-12 px-6 text-[15px]" onClick={onPrimary}>
                {config.hero_cta_primary}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-6 text-[15px]"
                onClick={onSecondary}
              >
                {config.hero_cta_secondary}
              </Button>
            </div>
          </div>
        </div>

        <div className="relative min-h-[280px] bg-muted lg:min-h-[440px]">
          {image ? (
            <img
              src={image}
              alt={config.hero_heading}
              className="absolute inset-0 h-full w-full object-cover"
              loading="eager"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/15 via-primary/5 to-accent/20">
              <ImageIcon className="h-10 w-10 text-muted-foreground/40" aria-hidden />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
