import { MousePointerClick, UploadCloud, PackageCheck } from "lucide-react";
import type { StorefrontStep } from "@/hooks/useStorefrontPages";

const STEP_ICONS = [MousePointerClick, UploadCloud, PackageCheck];

export default function HowItWorks({
  heading,
  steps,
}: {
  heading: string;
  steps: StorefrontStep[];
}) {
  if (!steps.length) return null;
  return (
    <section className="pb-3">
      <div className="sf-container">
        {heading && <h2 className="sr-only">{heading}</h2>}
        <ol className="sf-band grid overflow-hidden rounded-lg px-4 py-3 md:grid-cols-3 md:px-0">
          {steps.map((step, i) => {
            const Icon = STEP_ICONS[i % STEP_ICONS.length];
            return (
              <li
                key={step.title}
                className="grid min-h-[58px] grid-cols-[34px_36px_1fr] items-center gap-x-3 border-b py-3 last:border-b-0 md:border-b-0 md:border-r md:px-6 md:py-0 md:last:border-r-0"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <Icon className="h-7 w-7 shrink-0 text-foreground" strokeWidth={1.7} aria-hidden />
                <div className="min-w-0">
                  <b className="block text-[14px] font-bold leading-tight text-foreground">{step.title}</b>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
