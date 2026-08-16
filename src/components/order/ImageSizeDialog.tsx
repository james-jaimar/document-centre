import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ISO_SIZES, US_SIZES, type PaperSize } from "@/lib/paperSizes";
import { useMeasurementUnit } from "@/hooks/useMeasurementUnit";
import { Check, Image as ImageIcon } from "lucide-react";

export interface ImageSizeSelection {
  /** null = keep original */
  target: PaperSize | null;
}

interface Props {
  open: boolean;
  /** Representative image file for preview / dimension detection */
  imageFile: File | null;
  /** Optional list of sizes to offer. Falls back to ISO_SIZES when omitted/empty. */
  allowedSizes?: PaperSize[];
  onConfirm: (selection: ImageSizeSelection) => void;
  onCancel: () => void;
}

const PX_TO_MM = 25.4 / 72;

export default function ImageSizeDialog({
  open,
  imageFile,
  allowedSizes,
  onConfirm,
  onCancel,
}: Props) {
  const { unit, fmtSize } = useMeasurementUnit();
  const [imgDims, setImgDims] = useState<{
    widthPx: number;
    heightPx: number;
  } | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null); // null = original

  // Detect image dimensions
  useEffect(() => {
    if (!imageFile) return;
    const url = URL.createObjectURL(imageFile);
    const img = new window.Image();
    img.onload = () => {
      setImgDims({ widthPx: img.naturalWidth, heightPx: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedIdx(0); // default to first size
    }
  }, [open]);

  const isLandscape = imgDims
    ? imgDims.widthPx > imgDims.heightPx
    : false;

  const originalMm = imgDims
    ? {
        w: Math.round(imgDims.widthPx * PX_TO_MM),
        h: Math.round(imgDims.heightPx * PX_TO_MM),
      }
    : null;

  // Prefer product-family allowed sizes; fall back to the regional standard
  // set (ISO A-series, or the North American document sizes for US/CA).
  const US_DEFAULTS = ["Half Letter", "Letter", "Legal", "Tabloid", "12 × 18", "13 × 19"];
  const sourceSizes =
    allowedSizes && allowedSizes.length > 0
      ? allowedSizes
      : unit === "imperial"
        ? US_SIZES.filter((s) => US_DEFAULTS.includes(s.name))
        : ISO_SIZES;

  // Orientation-match rectangular sizes to the uploaded image; keep squares as-is.
  const sizeOptions = useMemo(() => {
    return sourceSizes.map((s) => {
      if (s.widthMm === s.heightMm) return { ...s };
      const w = isLandscape ? Math.max(s.widthMm, s.heightMm) : Math.min(s.widthMm, s.heightMm);
      const h = isLandscape ? Math.min(s.widthMm, s.heightMm) : Math.max(s.widthMm, s.heightMm);
      return { ...s, widthMm: w, heightMm: h };
    });
  }, [sourceSizes, isLandscape]);

  const fitLabel = (target: PaperSize) => {
    if (!imgDims) return "";
    const imgW = imgDims.widthPx * PX_TO_MM;
    const imgH = imgDims.heightPx * PX_TO_MM;
    const ratioImg = imgW / imgH;
    const ratioTarget = target.widthMm / target.heightMm;
    if (Math.abs(ratioImg - ratioTarget) < 0.02) return "Perfect fit";
    return "Scaled to fit (white margins)";
  };

  const handleConfirm = () => {
    if (selectedIdx === null) {
      onConfirm({ target: null });
    } else {
      onConfirm({ target: sizeOptions[selectedIdx] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            Choose Output Size
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Select the page size for your uploaded image
          {imgDims && originalMm
            ? ` (${fmtSize(originalMm.w, originalMm.h)} at 72 DPI)`
            : ""}
          .
        </p>

        <div className="grid gap-2 py-2">
          {sizeOptions.map((size, idx) => {
            const active = selectedIdx === idx;
            return (
              <button
                key={size.name}
                onClick={() => setSelectedIdx(idx)}
                className={cn(
                  "flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <div>
                  <span className="font-medium text-foreground">
                    {size.name}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {fmtSize(size.widthMm, size.heightMm)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {fitLabel(size)}
                  </span>
                  {active && <Check className="h-4 w-4 text-primary" />}
                </div>
              </button>
            );
          })}

          {/* Original size option */}
          <button
            onClick={() => setSelectedIdx(null)}
            className={cn(
              "flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors",
              selectedIdx === null
                ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                : "border-border hover:bg-muted/50"
            )}
          >
            <div>
              <span className="font-medium text-foreground">Original Size</span>
              {originalMm && (
                <span className="ml-2 text-muted-foreground">
                  {fmtSize(originalMm.w, originalMm.h)}
                </span>
              )}
            </div>
            {selectedIdx === null && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
