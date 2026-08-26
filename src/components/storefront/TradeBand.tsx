import { Button } from "@/components/ui/button";
import { Building2, Check } from "lucide-react";

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
    <section className="pb-8">
      <div className="sf-container">
        <div className="flex flex-col gap-4 rounded-xl border-[1.5px] border-[hsl(var(--sf-accent))] px-5 py-3.5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full sf-accent-soft sm:flex">
              <Building2 className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-[17px] font-bold leading-tight text-foreground">{heading}</h2>
              <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{body}</p>
            </div>
          </div>

          {benefits.length > 0 && (
            <ul className="flex flex-wrap items-center gap-x-7 gap-y-1.5 md:border-l md:pl-7">
              {benefits.map((b) => (
                <li key={b} className="flex items-center gap-2 text-[13px] text-foreground/80">
                  <Check className="h-3.5 w-3.5 sf-accent" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          )}

          <Button onClick={onClick} className="h-12 shrink-0 px-6 font-bold sf-accent-bg hover:opacity-90">
            {cta}
          </Button>
        </div>
      </div>
    </section>
  );
}
