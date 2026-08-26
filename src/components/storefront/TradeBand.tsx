import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function TradeBand({
  heading,
  body,
  cta,
  onClick,
}: {
  heading: string;
  body: string;
  cta: string;
  onClick: () => void;
}) {
  if (!heading && !body) return null;
  return (
    <section className="border-t bg-primary/5 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-5 px-6 md:flex-row md:items-center">
        <div>
          <h2 className="text-xl font-bold text-foreground md:text-2xl">{heading}</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{body}</p>
        </div>
        <Button size="lg" onClick={onClick} className="shrink-0">
          {cta}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
