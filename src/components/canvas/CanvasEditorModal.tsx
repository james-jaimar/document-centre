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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { RotateCw, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import type { CanvasPrintEntry } from "@/lib/canvasPrints/canvasSpecTypes";
import type { CroppedAreaPixels, PhotoFitMode } from "@/lib/photoPrints/types";
import { WRAP_MODE_OPTIONS, type WrapMode } from "@/lib/canvasPrints/types";
import { DEFAULT_BLEED_MM, DEFAULT_DPI, WRAP_DEPTH_PRESETS_MM } from "@/lib/canvasPrints/presets";
import { useCropperZoom } from "@/hooks/useCropperZoom";
import { useElementSize } from "@/hooks/useElementSize";
import AngledPreview from "@/components/canvas/AngledPreview";
import type { CanvasTransformState } from "@/lib/canvasPrints/types";

export interface CanvasSizeChoice {
  slug: string;
  label: string;
  frontWidthMm: number;
  frontHeightMm: number;
}

interface CanvasEditorModalProps {
  open: boolean;
  canvas: CanvasPrintEntry | null;
  signedUrl: string | null;
  sizes: CanvasSizeChoice[];
  allowedWrapDepthsMm: number[];
  onClose: () => void;
  onSave: (patch: Partial<CanvasPrintEntry>) => void;
  /** Scale factor from displayed preview coords back to source pixels. */
  pixelScale?: number;
}

export default function CanvasEditorModal({
  open,
  canvas,
  signedUrl,
  sizes,
  allowedWrapDepthsMm,
  onClose,
  onSave,
  pixelScale = 1,
}: CanvasEditorModalProps) {
  const [sizeSlug, setSizeSlug] = useState<string>("");
  const [wrapMm, setWrapMm] = useState<number>(38);
  const [wrapMode, setWrapMode] = useState<WrapMode>("gallery_wrap");
  const [wrapColorHex, setWrapColorHex] = useState<string | undefined>();

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<PhotoFitMode>("fill");
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CroppedAreaPixels | null>(null);

  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);

  const [containerRef, containerSize] = useElementSize<HTMLDivElement>(open);

  const size = useMemo(
    () => sizes.find((s) => s.slug === sizeSlug) ?? sizes[0] ?? null,
    [sizes, sizeSlug],
  );
  const aspect = size ? size.frontWidthMm / size.frontHeightMm : 1;

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

  // Seed from entry on open
  useEffect(() => {
    if (!open || !canvas) return;
    setSizeSlug(canvas.size_slug || sizes[0]?.slug || "");
    setWrapMm(canvas.wrapMm || allowedWrapDepthsMm[0] || 38);
    setWrapMode(canvas.wrapMode || "gallery_wrap");
    setWrapColorHex(canvas.wrapColorHex);
    setCrop(canvas.crop ?? { x: 0, y: 0 });
    setZoom(canvas.zoom || 1);
    setRotation(canvas.rotation || 0);
    setFitMode(canvas.fit_mode || "fill");
    setCroppedAreaPixels(canvas.croppedAreaPixels ?? null);
  }, [open, canvas, sizes, allowedWrapDepthsMm]);

  // Load an <img> element for the live 2.5D preview.
  useEffect(() => {
    if (!signedUrl) { setImgEl(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImgEl(img);
    img.src = signedUrl;
  }, [signedUrl]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  // Auto-snap fill/fit when the cropper settles
  const prevSnapKey = useRef("");
  useEffect(() => {
    if (!ready) return;
    const key = `${fillZoom.toFixed(6)}|${fitZoom.toFixed(6)}|${rotation}|${aspect}`;
    if (key === prevSnapKey.current) return;
    prevSnapKey.current = key;
    if (fitMode === "fit") setZoom(fitZoom);
    else setZoom(fillZoom);
  }, [fillZoom, fitZoom, ready, fitMode, rotation, aspect]);

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setRotation(0);
    setFitMode("fill");
  };
  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
    setCrop({ x: 0, y: 0 });
  };
  const handleFill = () => { setFitMode("fill"); setCrop({ x: 0, y: 0 }); setZoom(fillZoom); };
  const handleFit  = () => { setFitMode("fit");  setCrop({ x: 0, y: 0 }); setZoom(fitZoom); };

  // Live 2.5D preview transform state — derived so it matches what we'll save.
  const previewTransform: CanvasTransformState | null = useMemo(() => {
    if (!canvas || !size || !imgEl) return null;
    // Crude approximation: we drive the AngledPreview from the imageScale
    // implied by the current zoom (fillZoom == scale 1). This is a preview
    // only — the print-ready output on the server rebuilds from the exact
    // croppedAreaPixels rect.
    const scale = fillZoom > 0 ? zoom / fillZoom : 1;
    return {
      presetId: size.slug,
      frontWidthMm: size.frontWidthMm,
      frontHeightMm: size.frontHeightMm,
      wrapMm,
      bleedMm: DEFAULT_BLEED_MM,
      dpi: DEFAULT_DPI,
      wrapMode,
      wrapColorHex,
      imageScale: scale,
      imageX: 0,
      imageY: 0,
      imageRotation: rotation,
      imageNaturalWidth: imgEl.naturalWidth,
      imageNaturalHeight: imgEl.naturalHeight,
    };
  }, [canvas, size, imgEl, wrapMm, wrapMode, wrapColorHex, rotation, zoom, fillZoom]);

  const handleSave = () => {
    if (!size) return;
    let scaled = croppedAreaPixels;
    if (scaled && pixelScale && Math.abs(pixelScale - 1) > 0.001) {
      scaled = {
        x: Math.round(scaled.x * pixelScale),
        y: Math.round(scaled.y * pixelScale),
        width: Math.round(scaled.width * pixelScale),
        height: Math.round(scaled.height * pixelScale),
      };
    }
    onSave({
      size_slug: size.slug,
      frontWidthMm: size.frontWidthMm,
      frontHeightMm: size.frontHeightMm,
      wrapMm,
      bleedMm: DEFAULT_BLEED_MM,
      dpi: DEFAULT_DPI,
      wrapMode,
      wrapColorHex,
      crop,
      zoom,
      rotation,
      fit_mode: fitMode,
      croppedAreaPixels: scaled,
    });
  };

  if (!canvas) return null;

  const depthOpts = allowedWrapDepthsMm.length > 0
    ? allowedWrapDepthsMm
    : (WRAP_DEPTH_PRESETS_MM as unknown as number[]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-lg">Edit Canvas</DialogTitle>
          <DialogDescription className="text-xs">
            {canvas.file_name}
            {size && ` · ${size.label}`}
            {` · ${wrapMm} mm wrap`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-0 max-h-[70vh] overflow-hidden">
          {/* Left: cropper + 2.5D preview */}
          <div className="min-w-0 space-y-3 p-4 overflow-y-auto">
            <div ref={containerRef} className="relative w-full bg-black rounded-md overflow-hidden" style={{ height: 380 }}>
              {signedUrl ? (
                <Cropper
                  image={signedUrl}
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

            <div className="flex items-center justify-between gap-3">
              <Slider
                value={[zoom]}
                min={minZoom}
                max={4}
                step={0.01}
                onValueChange={(v) => setZoom(v[0])}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                {zoom.toFixed(2)}×
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRotate} className="gap-1.5">
                <RotateCw className="h-3.5 w-3.5" /> Rotate 90°
              </Button>
              <Button
                variant={fitMode === "fill" ? "default" : "outline"}
                size="sm" onClick={handleFill} className="gap-1.5"
              >
                <Maximize2 className="h-3.5 w-3.5" /> Fill
              </Button>
              <Button
                variant={fitMode === "fit" ? "default" : "outline"}
                size="sm" onClick={handleFit} className="gap-1.5"
              >
                <Minimize2 className="h-3.5 w-3.5" /> Fit
              </Button>
              <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5 ml-auto">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
            </div>

            {previewTransform && imgEl && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  How it will look on the wall
                </p>
                <AngledPreview image={imgEl} state={previewTransform} />
              </div>
            )}
          </div>

          {/* Right: settings */}
          <div className="border-l border-border bg-muted/20 p-4 space-y-5 overflow-y-auto">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide">Canvas size</Label>
              <Select value={sizeSlug} onValueChange={setSizeSlug}>
                <SelectTrigger><SelectValue placeholder="Choose size" /></SelectTrigger>
                <SelectContent>
                  {sizes.map((s) => (
                    <SelectItem key={s.slug} value={s.slug}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide">Wrap depth</Label>
              <RadioGroup
                value={String(wrapMm)}
                onValueChange={(v) => setWrapMm(Number(v))}
                className="grid grid-cols-3 gap-2"
              >
                {depthOpts.map((d) => (
                  <label
                    key={d}
                    className={`border rounded-md p-2 text-center cursor-pointer text-sm ${wrapMm === d ? "border-primary bg-primary/10 font-medium" : "hover:border-primary/40"}`}
                  >
                    <RadioGroupItem value={String(d)} className="sr-only" />
                    {d} mm
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide">Edge finish</Label>
              <div className="space-y-1.5">
                {WRAP_MODE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`block border rounded-md p-2 cursor-pointer text-xs transition ${wrapMode === opt.value ? "border-primary bg-primary/10" : "hover:border-primary/40"}`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        className="accent-primary"
                        checked={wrapMode === opt.value}
                        onChange={() => setWrapMode(opt.value)}
                      />
                      <span className="font-medium">{opt.label}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 ml-6 leading-snug">{opt.help}</p>
                  </label>
                ))}
              </div>
              {wrapMode === "colour_wrap" && (
                <div className="flex items-center gap-2 pt-1">
                  <Label className="text-xs">Colour</Label>
                  <Input
                    type="color"
                    value={wrapColorHex ?? "#ffffff"}
                    onChange={(e) => setWrapColorHex(e.target.value)}
                    className="h-8 w-14 p-1"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
