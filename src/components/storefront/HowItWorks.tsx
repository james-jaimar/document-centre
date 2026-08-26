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
    <section className="pb-4">
      <div className="sf-container">
        {heading && <h2 className="sr-only">{heading}</h2>}
        <ol className="sf-band grid gap-4 rounded-xl px-[2%] py-4 md:grid-cols-3">
          {steps.map((step, i) => {
            const Icon = STEP_ICONS[i % STEP_ICONS.length];
            return (
              <li
                key={step.title}
                className="grid grid-cols-[32px_1fr] items-start gap-x-3 gap-y-1 pr-6 md:border-r md:last:border-r-0"
              >
                <span className="row-span-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-foreground/70" aria-hidden />
                  <b className="text-[15px] font-bold text-foreground">{step.title}</b>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
