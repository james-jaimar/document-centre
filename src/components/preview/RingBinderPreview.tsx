import type { PreviewComponentProps } from "./previewTypes";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import binderClosedImg from "@/assets/bindings/ring_binder_white_closed.png";
import binderOpenImg from "@/assets/bindings/ring_binder_white_open.png";

/**
 * Ring Binder Preview — uses real photographic assets of a white PVC ring binder.
 * - Page 0: closed binder with cover thumbnail visible through the clear PVC pocket.
 * - Page >= 1: open spread showing the 4 D-rings, with previous + current page overlaid.
 */

const BINDER_CLOSED_ASPECT = 793 / 833;   // ~0.952 portrait
const BINDER_OPEN_ASPECT = 1781 / 840;    // ~2.12 landscape

// Inside-page clear area of the closed binder cover pocket (% of binder image)
const CLOSED_PAGE_INSET = { top: 0.05, bottom: 0.05, left: 0.06, right: 0.06 };

// Open binder page positioning (% of binder image)
const OPEN_PAGE_INSET = {
  top: 0.05,
  bottom: 0.05,
  sideMargin: 0.05,
  spineHalfWidth: 0.07,
};

function PageImage({ src, grayscale }: { src?: string; grayscale?: boolean }) {
  if (!src) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-card/40">
        <FileText className="h-8 w-8 text-muted-foreground/30" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="w-full h-full object-contain bg-white"
      style={{ filter: grayscale ? "grayscale(100%)" : "none" }}
    />
  );
}

export default function RingBinderPreview({
  urls,
  currentPage,
  onPageChange,
  width,
  height,
  colorFlags,
}: PreviewComponentProps) {
  const total = urls.length;
  const page = Math.min(Math.max(currentPage, 0), Math.max(total - 1, 0));
  const isCover = page === 0 || total <= 1;

  // Pick aspect for the active view and fit binder inside the container.
  const aspect = isCover ? BINDER_CLOSED_ASPECT : BINDER_OPEN_ASPECT;
  const navHeight = total > 1 ? 36 : 0;
  const availableHeight = Math.max(height - navHeight - 12, 100);
  const availableWidth = Math.max(width, 100);

  let binderWidth = availableWidth;
  let binderHeight = binderWidth / aspect;
  if (binderHeight > availableHeight) {
    binderHeight = availableHeight;
    binderWidth = binderHeight * aspect;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3" style={{ width, height }}>
      <div
        className="relative"
        style={{
          width: binderWidth,
          height: binderHeight,
          filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.18))",
        }}
      >
        {/* Binder photograph */}
        <img
          src={isCover ? binderClosedImg : binderOpenImg}
          alt={isCover ? "Closed ring binder" : "Open ring binder"}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />

        {isCover ? (
          // Cover thumbnail behind the clear PVC pocket
          <div
            className="absolute overflow-hidden"
            style={{
              left: `${CLOSED_PAGE_INSET.left * 100}%`,
              right: `${CLOSED_PAGE_INSET.right * 100}%`,
              top: `${CLOSED_PAGE_INSET.top * 100}%`,
              bottom: `${CLOSED_PAGE_INSET.bottom * 100}%`,
            }}
          >
            <PageImage src={urls[0]} grayscale={colorFlags?.[0] === false} />
            {/* Subtle PVC pocket sheen overlay */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 65%, rgba(255,255,255,0.10) 100%)",
              }}
            />
          </div>
        ) : (
          <>
            {/* Left page (previous) */}
            <div
              className="absolute overflow-hidden"
              style={{
                left: `${OPEN_PAGE_INSET.sideMargin * 100}%`,
                right: `${(0.5 + OPEN_PAGE_INSET.spineHalfWidth) * 100}%`,
                top: `${OPEN_PAGE_INSET.top * 100}%`,
                bottom: `${OPEN_PAGE_INSET.bottom * 100}%`,
              }}
            >
              <PageImage
                src={urls[page - 1]}
                grayscale={colorFlags?.[page - 1] === false}
              />
            </div>
            {/* Right page (current) */}
            <div
              className="absolute overflow-hidden"
              style={{
                left: `${(0.5 + OPEN_PAGE_INSET.spineHalfWidth) * 100}%`,
                right: `${OPEN_PAGE_INSET.sideMargin * 100}%`,
                top: `${OPEN_PAGE_INSET.top * 100}%`,
                bottom: `${OPEN_PAGE_INSET.bottom * 100}%`,
              }}
            >
              <PageImage src={urls[page]} grayscale={colorFlags?.[page] === false} />
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      {total > 1 && (
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {isCover ? "Cover" : `Page ${page + 1} of ${total}`}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={page >= total - 1}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
