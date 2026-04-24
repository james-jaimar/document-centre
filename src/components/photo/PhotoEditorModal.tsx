import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { RotateCw, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import type { PhotoPrintEntry, PhotoFitMode, CroppedAreaPixels } from "@/lib/photoPrints/types";
import { getPhotoPrintSize, PHOTO_BORDER_OPTIONS } from "@/lib/photoPrints/sizes";
import { borderFractionFor } from "@/lib/photoPrints/renderPreview";

interface PhotoEditorModalProps {
  open: boolean;
  photo: PhotoPrintEntry | null;
  signedUrl: string | null;
  borderSlug: string;
  onClose: () => void;
  onSave: (
    next: Pick<
      PhotoPrintEntry,
      "crop" | "zoom" | "rotation" | "fit_mode" | "croppedAreaPixels"
    >,
  ) => void;
}

export default function PhotoEditorModal({
  open,
  photo,
  signedUrl,
  borderSlug,
  onClose,
  onSave,
}: PhotoEditorModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<PhotoFitMode>("fill");
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CroppedAreaPixels | null>(null);

  useEffect(() => {
    if (!open || !photo) return;
    setCrop(photo.crop ?? { x: 0, y: 0 });
    setZoom(photo.zoom || 1);
    setRotation(photo.rotation || 0);
    setFitMode(photo.fit_mode || "fill");
    setCroppedAreaPixels(photo.croppedAreaPixels ?? null);
  }, [open, photo]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setFitMode("fill");
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const handleSave = () => {
    onSave({
      crop,
      zoom,
      rotation,
      fit_mode: fitMode,
      croppedAreaPixels,
    });
  };

  if (!photo) return null;
  const size = getPhotoPrintSize(photo.print_size_slug);
  const border = PHOTO_BORDER_OPTIONS.find((o) => o.slug === borderSlug);
  const borderMm = border?.border_mm ?? 0;
  const longEdgeMm = Math.max(size.width_mm, size.height_mm);
  const borderFraction = borderFractionFor(longEdgeMm, borderMm);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-lg">Edit Photo</DialogTitle>
          <DialogDescription className="text-xs">
            {photo.file_name} · Print size {size.label}
            {borderFraction > 0 && " · White border (3 mm)"}
          </DialogDescription>
        </DialogHeader>

        {/* Cropper area */}
        <div className="relative w-full bg-black" style={{ height: 420 }}>
          {signedUrl ? (
            <Cropper
              image={signedUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={size.aspect}
              objectFit="cover"
              showGrid={true}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              minZoom={1}
              maxZoom={4}
              zoomSpeed={0.5}
              restrictPosition={true}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
              Loading photo…
            </div>
          )}

          {/* White-border overlay (non-interactive) — drawn over the crop frame */}
          {borderFraction > 0 && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-hidden
            >
              <div
                className="relative"
                style={{
                  // Match cropper aspect — overlay sized via padding tricks would be hard;
                  // instead, draw a thin white inset frame across the full container.
                  // We render four rectangles using outline trick: a transparent inner box
                  // with white outset. Simpler: a single inset border via box-shadow.
                  width: "70%",
                  aspectRatio: size.aspect,
                  boxShadow: `inset 0 0 0 ${Math.max(2, Math.round(borderFraction * 100))}px rgba(255,255,255,0.85)`,
                }}
              />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-6 py-4 space-y-4 bg-card">
          {/* Zoom slider */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Zoom</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {zoom.toFixed(2)}×
              </span>
            </div>
            <Slider
              value={[zoom]}
              min={1}
              max={4}
              step={0.01}
              onValueChange={(v) => setZoom(v[0])}
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRotate} className="gap-1.5">
              <RotateCw className="h-3.5 w-3.5" />
              Rotate 90°
            </Button>
            <Button
              variant={fitMode === "fill" ? "default" : "outline"}
              size="sm"
              onClick={() => setFitMode("fill")}
              className="gap-1.5"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Fill
            </Button>
            <Button
              variant={fitMode === "fit" ? "default" : "outline"}
              size="sm"
              onClick={() => setFitMode("fit")}
              className="gap-1.5"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Fit
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5 ml-auto">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
