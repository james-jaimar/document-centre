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
    <section className="pb-4">
      <div className="sf-container">
        <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-[hsl(var(--sf-accent))] px-5 py-2.5 md:min-h-[66px] md:flex-row md:items-center md:justify-between">
          <div className="flex shrink-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full sf-accent-soft">
              <Building2 className="h-5 w-5 sf-accent" aria-hidden />
            </span>
            <div>
              <h2 className="text-[16px] font-bold leading-tight text-foreground">{heading}</h2>
              {body && <p className="mt-0.5 max-w-sm text-[11px] text-muted-foreground">{body}</p>}
            </div>
          </div>

          {benefits.length > 0 && (
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-1.5 md:border-l md:pl-6">
              {benefits.map((b) => (
                <li key={b} className="flex items-center gap-1.5 text-[11px] text-foreground/80">
                  <Check className="h-3.5 w-3.5 sf-accent" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          )}

          <Button onClick={onClick} className="h-10 shrink-0 px-6 text-[13px] font-bold sf-accent-bg hover:opacity-90">
            {cta}
          </Button>
        </div>
      </div>
    </section>
  );
}
