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
    <section className="sf-band border-t py-14">
      <div className="sf-container">
        <h2 className="sf-section-title text-center text-foreground">{heading}</h2>
        <ol className="mt-8 grid divide-y rounded-xl border bg-background md:grid-cols-3 md:divide-x md:divide-y-0">
          {steps.map((step, i) => {
            const Icon = STEP_ICONS[i % STEP_ICONS.length];
            return (
              <li key={step.title} className="px-7 py-8">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
