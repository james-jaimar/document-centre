import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export default function ProductLightbox({
  images,
  index,
  alt,
  onClose,
  onStep,
}: {
  images: string[];
  index: number;
  alt: string;
  onClose: () => void;
  onStep: (dir: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  const src = images[index];
  if (!src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} image viewer`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-background p-2 shadow"
        onClick={onClose}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <img
        src={src}
        alt={`${alt} — image ${index + 1} of ${images.length}`}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            className="absolute left-4 rounded-full bg-background p-2 shadow"
            onClick={(e) => {
              e.stopPropagation();
              onStep(-1);
            }}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next image"
            className="absolute right-4 top-1/2 rounded-full bg-background p-2 shadow"
            onClick={(e) => {
              e.stopPropagation();
              onStep(1);
            }}
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
