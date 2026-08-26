import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [alt]);

  const current = images[index] ?? null;
  const step = (dir: number) =>
    setIndex((i) => (images.length ? (i + dir + images.length) % images.length : 0));

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border bg-muted">
        {current ? (
          <img src={current} alt={alt} className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center">
            <FileText className="h-12 w-12 text-muted-foreground/40" aria-hidden />
          </div>
        )}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow-sm hover:bg-background"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow-sm hover:bg-background"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-3">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Image ${i + 1}`}
              className={cn(
                "h-20 w-20 overflow-hidden rounded-lg border bg-muted",
                i === index && "ring-2 ring-primary ring-offset-2",
              )}
            >
              <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
