import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RotateCw, RotateCcw, Maximize2, Minimize2 } from "lucide-react";
import type { CroppedAreaPixels } from "@/lib/photoPrints/types";
import { useCropperZoom } from "@/hooks/useCropperZoom";
import { useElementSize } from "@/hooks/useElementSize";

export interface PosterSizeChoice {
  slug: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

export const POSTER_SIZE_CHOICES: PosterSizeChoice[] = [
  { slug: "a4", label: "A4 (210 × 297 mm)", widthMm: 210, heightMm: 297 },
  { slug: "a3", label: "A3 (297 × 420 mm)", widthMm: 297, heightMm: 420 },
  { slug: "a2", label: "A2 (420 × 594 mm)", widthMm: 420, heightMm: 594 },
  { slug: "a1", label: "A1 (594 × 841 mm)", widthMm: 594, heightMm: 841 },
  { slug: "a0", label: "A0 (841 × 1189 mm)", widthMm: 841, heightMm: 1189 },
];

const DEFAULT_POSTER_SLUG = "a2";

export type PosterFitMode = "fill" | "fit";

export interface PosterEditorResult {
  size: PosterSizeChoice;
  orientation: "portrait" | "landscape";
  croppedAreaPixels: CroppedAreaPixels;
  rotation: number;
  zoom: number;
  crop: { x: number; y: number };
}

export interface PosterEditorInitialState {
  sizeSlug?: string;
  orientation?: "portrait" | "landscape";
  crop?: { x: number; y: number };
  zoom?: number;
  rotation?: number;
}

interface Props {
  open: boolean;
  file: File | null;
  initialSizeSlug?: string;
  initialState?: PosterEditorInitialState;
  title?: string;
  onCancel: () => void;
  onConfirm: (result: PosterEditorResult) => void;
}

export default function PosterImageEditor({
  open,
  file,
  initialSizeSlug,
  initialState,
  title,
  onCancel,
  onConfirm,
}: Props) {
  const [sizeSlug, setSizeSlug] = useState<string>(
    initialState?.sizeSlug ?? initialSizeSlug ?? DEFAULT_POSTER_SLUG,
  );
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    initialState?.orientation ?? "portrait",
  );
  const [crop, setCrop] = useState(initialState?.crop ?? { x: 0, y: 0 });
  const [zoom, setZoom] = useState(initialState?.zoom ?? 1);
  const [rotation, setRotation] = useState(initialState?.rotation ?? 0);
  const [fitMode, setFitMode] = useState<PosterFitMode>("fill");
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CroppedAreaPixels | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const hasInitialState = !!initialState;

  // Measure container — only when dialog is open
  const [containerRef, containerSize] = useElementSize<HTMLDivElement>(open);

  const sizeChoice = useMemo(
    () => POSTER_SIZE_CHOICES.find((s) => s.slug === sizeSlug) ?? POSTER_SIZE_CHOICES[2],
    [sizeSlug],
  );

  const aspect = useMemo(() => {
    const w = orientation === "landscape" ? Math.max(sizeChoice.widthMm, sizeChoice.heightMm) : Math.min(sizeChoice.widthMm, sizeChoice.heightMm);
    const h = orientation === "landscape" ? Math.min(sizeChoice.widthMm, sizeChoice.heightMm) : Math.max(sizeChoice.widthMm, sizeChoice.heightMm);
    return w / h;
  }, [sizeChoice, orientation]);

  const {
    fillZoom,
    fitZoom,
    minZoom,
    cropSize,
    onMediaLoaded,
    restrictPosition,
    ready,
  } = useCropperZoom({
    rotation,
    zoom,
    aspect,
    containerWidth: containerSize.width,
    containerHeight: containerSize.height,
  });

  // Build / revoke object URL for the source file.
  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      setImageDims(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    const probe = new Image();
    probe.onload = () => setImageDims({ w: probe.naturalWidth, h: probe.naturalHeight });
    probe.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // When the dialog (re-)opens reset to defaults (or to provided initial state).
  useEffect(() => {
    if (!open) return;
    setSizeSlug(initialState?.sizeSlug ?? initialSizeSlug ?? DEFAULT_POSTER_SLUG);
    setCrop(initialState?.crop ?? { x: 0, y: 0 });
    setZoom(initialState?.zoom ?? 1);
    setRotation(initialState?.rotation ?? 0);
    setFitMode("fill");
    if (initialState?.orientation) setOrientation(initialState.orientation);
  }, [open, initialSizeSlug, initialState]);

  // Auto-pick orientation to match the source image's natural aspect
  useEffect(() => {
    if (!imageDims || hasInitialState) return;
    setOrientation(imageDims.w >= imageDims.h ? "landscape" : "portrait");
  }, [imageDims, hasInitialState]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  // Snap zoom when fill/fit values settle
  const prevSnapKey = useRef("");
  useEffect(() => {
    if (!ready) return;
    const key = `${fillZoom.toFixed(6)}|${fitZoom.toFixed(6)}|${rotation}`;
    if (key === prevSnapKey.current) return;
    prevSnapKey.current = key;
    if (fitMode === "fit") setZoom(fitZoom);
    else setZoom(fillZoom);
  }, [fillZoom, fitZoom, ready, fitMode, rotation]);

  const handleFill = () => {
    setFitMode("fill");
    setCrop({ x: 0, y: 0 });
    setZoom(fillZoom);
  };

  const handleFit = () => {
    setFitMode("fit");
    setCrop({ x: 0, y: 0 });
    setZoom(fitZoom);
  };

  const handleSave = () => {
    if (!croppedAreaPixels) return;
    const portraitW = Math.min(sizeChoice.widthMm, sizeChoice.heightMm);
    const portraitH = Math.max(sizeChoice.widthMm, sizeChoice.heightMm);
    const finalSize: PosterSizeChoice =
      orientation === "landscape"
        ? { ...sizeChoice, widthMm: portraitH, heightMm: portraitW }
        : { ...sizeChoice, widthMm: portraitW, heightMm: portraitH };
    onConfirm({ size: finalSize, orientation, croppedAreaPixels, rotation, zoom, crop });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-lg">{title ?? "Crop & position your poster"}</DialogTitle>
          <DialogDescription className="text-xs">
            {file?.name ?? "Image"} — pick a size, then drag and zoom to frame the image.
          </DialogDescription>
        </DialogHeader>

        {/* Size + orientation controls */}
        <div className="px-6 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-border">
          <div className="space-y-1">
            <Label className="text-xs font-medium">Poster size</Label>
            <Select value={sizeSlug} onValueChange={setSizeSlug}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSTER_SIZE_CHOICES.map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium">Orientation</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={orientation === "portrait" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setOrientation("portrait")}
              >
                Portrait
              </Button>
              <Button
                type="button"
                variant={orientation === "landscape" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setOrientation("landscape")}
              >
                Landscape
              </Button>
            </div>
          </div>
        </div>

        {/* Cropper area — mount Cropper as soon as we have a URL */}
        <div ref={containerRef} className="relative w-full bg-black" style={{ height: 420 }}>
          {imageUrl ? (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              cropSize={cropSize}
              objectFit="contain"
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              onMediaLoaded={onMediaLoaded}
              minZoom={minZoom}
              maxZoom={4}
              zoomSpeed={0.5}
              restrictPosition={restrictPosition}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
              Loading image…
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-6 py-4 space-y-4 bg-card">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Zoom</Label>
              <span className="text-xs text-muted-foreground tabular-nums">{zoom.toFixed(2)}×</span>
            </div>
            <Slider value={[zoom]} min={minZoom} max={4} step={0.01} onValueChange={(v) => setZoom(v[0])} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setRotation((r) => (r + 270) % 360); setCrop({ x: 0, y: 0 }); }}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Rotate -90°
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setRotation((r) => (r + 90) % 360); setCrop({ x: 0, y: 0 }); }}
              className="gap-1.5"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Rotate +90°
            </Button>
            <Button
              variant={fitMode === "fill" ? "default" : "outline"}
              size="sm"
              onClick={handleFill}
              className="gap-1.5"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Fill
            </Button>
            <Button
              variant={fitMode === "fit" ? "default" : "outline"}
              size="sm"
              onClick={handleFit}
              className="gap-1.5"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              Fit
            </Button>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!croppedAreaPixels || !imageUrl}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
