import { Button } from "@/components/ui/button";
import { ArrowRight, Building2, Check } from "lucide-react";

export default function TradeBand({
  heading,
  body,
  cta,
  benefits = [],
  onClick,
}: {
  heading: string;
  body: string;
  cta: string;
  benefits?: string[];
  onClick: () => void;
}) {
  if (!heading && !body) return null;
  return (
    <section className="py-12">
      <div className="sf-container">
        <div className="flex flex-col gap-6 rounded-xl border sf-accent-soft p-7 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-4">
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-background sm:flex">
              <Building2 className="h-5 w-5 sf-accent" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-bold text-foreground md:text-xl">{heading}</h2>
              <p className="mt-1 max-w-2xl text-sm text-foreground/80">{body}</p>
              {benefits.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
                  {benefits.map((b) => (
                    <li key={b} className="flex items-center gap-1.5 text-sm text-foreground/80">
                      <Check className="h-3.5 w-3.5 sf-accent" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <Button size="lg" onClick={onClick} className="shrink-0">
            {cta}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
