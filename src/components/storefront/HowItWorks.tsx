import type { StorefrontStep } from "@/hooks/useStorefrontPages";

export default function HowItWorks({
  heading,
  steps,
}: {
  heading: string;
  steps: StorefrontStep[];
}) {
  if (!steps.length) return null;
  return (
    <section className="border-t bg-muted/30 py-14">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="text-center text-2xl font-bold text-foreground md:text-3xl">{heading}</h2>
        <ol className="mt-9 grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-xl border bg-background p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {i + 1}
              </span>
              <h3 className="mt-4 font-semibold text-foreground">{step.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
