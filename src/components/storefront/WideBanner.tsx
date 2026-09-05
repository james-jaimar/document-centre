import { ArrowRight } from "lucide-react";
import type { StorefrontWideBanner } from "@/hooks/useStorefrontPages";

/** Full-width dark statement banner with a background image. */
export default function WideBanner({
  data,
  onClick,
}: {
  data: StorefrontWideBanner;
  onClick: () => void;
}) {
  if (!data.heading && !data.body) return null;
  const copyRight = data.image_side === "left";

  return (
    <section className="pb-10">
      <div className="sf-container">
        <div className="relative isolate overflow-hidden bg-[hsl(var(--sf-navy))] min-h-[300px] lg:min-h-[360px]">
          {data.image_url && (
            <img
              src={data.image_url}
              alt=""
              aria-hidden
              loading="lazy"
              className={`absolute inset-y-0 h-full w-full object-cover lg:w-[62%] ${
                copyRight ? "left-0" : "right-0"
              }`}
            />
          )}
          <span
            className="absolute inset-0 bg-[hsl(var(--sf-navy))]"
            style={{ opacity: (data.overlay ?? 40) / 100 }}
            aria-hidden
          />

          <div
            className={`relative flex min-h-[300px] flex-col justify-center gap-4 px-8 py-12 lg:min-h-[360px] lg:max-w-[52%] lg:px-14 ${
              copyRight ? "lg:ml-auto" : ""
            }`}
          >
            <h2 className="sf-display whitespace-pre-line text-[clamp(1.6rem,2.6vw,2.4rem)] uppercase leading-[1.12] text-white">
              {data.heading}
            </h2>
            <span className="block h-[3px] w-10 bg-[hsl(var(--sf-blue))]" aria-hidden />
            {data.body && (
              <p className="max-w-[46ch] whitespace-pre-line text-[14px] leading-relaxed text-white/80">
                {data.body}
              </p>
            )}
            {data.cta_label && (
              <button
                type="button"
                onClick={onClick}
                className="group mt-2 flex w-fit items-center gap-2 text-[13px] font-semibold text-white"
              >
                {data.cta_label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
