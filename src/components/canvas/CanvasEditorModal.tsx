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
import { RotateCw, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import type { CanvasPrintEntry } from "@/lib/canvasPrints/canvasSpecTypes";
import type { CroppedAreaPixels, PhotoFitMode } from "@/lib/photoPrints/types";
import { WRAP_MODE_OPTIONS, type PageOrientation, type WrapMode } from "@/lib/canvasPrints/types";
import { DEFAULT_BLEED_MM, DEFAULT_DPI, WRAP_DEPTH_PRESETS_MM } from "@/lib/canvasPrints/presets";
import { useCropperZoom } from "@/hooks/useCropperZoom";
import { useElementSize } from "@/hooks/useElementSize";
import Canvas3DPreview from "@/components/canvas/Canvas3DPreview";
import DebouncedColorInput from "@/components/canvas/DebouncedColorInput";
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

/** Return the effective face dimensions for a size + orientation. */
function orientedDims(
  size: CanvasSizeChoice | null,
  orientation: PageOrientation,
): { w: number; h: number } {
  if (!size) return { w: 0, h: 0 };
  const [longEdge, shortEdge] = size.frontWidthMm >= size.frontHeightMm
    ? [size.frontWidthMm, size.frontHeightMm]
    : [size.frontHeightMm, size.frontWidthMm];
  return orientation === "landscape"
    ? { w: longEdge, h: shortEdge }
    : { w: shortEdge, h: longEdge };
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
  const [orientation, setOrientation] = useState<PageOrientation>("landscape");
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

  const rawSize = useMemo(
    () => sizes.find((s) => s.slug === sizeSlug) ?? sizes[0] ?? null,
    [sizes, sizeSlug],
  );
  const orientedSize = useMemo<CanvasSizeChoice | null>(() => {
    if (!rawSize) return null;
    const { w, h } = orientedDims(rawSize, orientation);
    return { ...rawSize, frontWidthMm: w, frontHeightMm: h };
  }, [rawSize, orientation]);

  const aspect = orientedSize ? orientedSize.frontWidthMm / orientedSize.frontHeightMm : 1;

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

  // Seed from entry on open.
  useEffect(() => {
    if (!open || !canvas) return;
    setSizeSlug(canvas.size_slug || sizes[0]?.slug || "");
    // Derive orientation from stored dims (landscape when w >= h).
    const persisted: PageOrientation | undefined = (canvas as any).pageOrientation;
    if (persisted === "landscape" || persisted === "portrait") {
      setOrientation(persisted);
    } else {
      setOrientation(canvas.frontWidthMm >= canvas.frontHeightMm ? "landscape" : "landscape");
    }
    setWrapMm(canvas.wrapMm || allowedWrapDepthsMm[0] || 38);
    setWrapMode(canvas.wrapMode || "gallery_wrap");
    setWrapColorHex(canvas.wrapColorHex);
    setCrop(canvas.crop ?? { x: 0, y: 0 });
    setZoom(canvas.zoom || 1);
    setRotation(canvas.rotation || 0);
    setFitMode(canvas.fit_mode || "fill");
    setCroppedAreaPixels(canvas.croppedAreaPixels ?? null);
  }, [open, canvas, sizes, allowedWrapDepthsMm]);

  // Load an <img> element for the live 3D preview.
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

  // Auto-snap fill/fit when the cropper settles.
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
  const handleRotateImage = () => {
    setRotation((r) => (r + 90) % 360);
    setCrop({ x: 0, y: 0 });
  };
  const handleFill = () => { setFitMode("fill"); setCrop({ x: 0, y: 0 }); setZoom(fillZoom); };
  const handleFit  = () => { setFitMode("fit");  setCrop({ x: 0, y: 0 }); setZoom(fitZoom); };

  // Build a pre-cropped face bitmap that matches the cropper exactly. The
  // 3D preview then treats this as a fit-cover face image (no pan/scale),
  // so what's inside the crop box == what's on the front of the canvas.
  const faceBitmap = useMemo<HTMLCanvasElement | null>(() => {
    if (!imgEl || !orientedSize || !croppedAreaPixels) return null;
    const targetLong = 900;
    const aspectFace = orientedSize.frontWidthMm / orientedSize.frontHeightMm;
    const outW = aspectFace >= 1 ? targetLong : Math.round(targetLong * aspectFace);
    const outH = aspectFace >= 1 ? Math.round(targetLong / aspectFace) : targetLong;
    const c = document.createElement("canvas");
    c.width = outW; c.height = outH;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    try {
      ctx.drawImage(
        imgEl,
        croppedAreaPixels.x, croppedAreaPixels.y,
        croppedAreaPixels.width, croppedAreaPixels.height,
        0, 0, outW, outH,
      );
    } catch { /* ignore draw errors */ }
    return c;
  }, [imgEl, orientedSize, croppedAreaPixels]);

  const previewTransform: CanvasTransformState | null = useMemo(() => {
    if (!canvas || !orientedSize || !faceBitmap) return null;
    return {
      presetId: orientedSize.slug,
      frontWidthMm: orientedSize.frontWidthMm,
      frontHeightMm: orientedSize.frontHeightMm,
      wrapMm,
      bleedMm: DEFAULT_BLEED_MM,
      dpi: DEFAULT_DPI,
      wrapMode,
      wrapColorHex,
      imageScale: 1,
      imageX: 0,
      imageY: 0,
      imageRotation: 0,
      imageNaturalWidth: faceBitmap.width,
      imageNaturalHeight: faceBitmap.height,
    };
  }, [canvas, orientedSize, faceBitmap, wrapMm, wrapMode, wrapColorHex]);


  const handleSave = () => {
    if (!orientedSize) return;
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
      size_slug: orientedSize.slug,
      frontWidthMm: orientedSize.frontWidthMm,
      frontHeightMm: orientedSize.frontHeightMm,
      pageOrientation: orientation,
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
    } as Partial<CanvasPrintEntry>);
  };

  if (!canvas) return null;

  const depthOpts = allowedWrapDepthsMm.length > 0
    ? allowedWrapDepthsMm
    : (WRAP_DEPTH_PRESETS_MM as unknown as number[]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[90vw] max-w-[1600px] h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-lg">Edit Canvas</DialogTitle>
          <DialogDescription className="text-xs">
            {canvas.file_name}
            {orientedSize && ` · ${orientedSize.label}`}
            {` · ${orientation === "landscape" ? "Landscape" : "Portrait"} · ${wrapMm} mm wrap`}
          </DialogDescription>
        </DialogHeader>

        {/* Left: upload + scale/crop | Right: 3D preview + settings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 min-h-0 flex-1 overflow-hidden">
          {/* LEFT — cropper */}
          <div className="min-w-0 flex flex-col p-5 gap-3 overflow-y-auto border-r border-border">
            <div
              ref={containerRef}
              className="relative w-full bg-black rounded-md overflow-hidden flex-1 min-h-[380px]"
            >
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

            <div className="flex items-center gap-3">
              <Label className="text-xs w-14 shrink-0">Zoom</Label>
              <Slider
                value={[zoom]}
                min={minZoom}
                max={4}
                step={0.01}
                onValueChange={(v) => setZoom(v[0])}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">
                {zoom.toFixed(2)}×
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRotateImage} className="gap-1.5">
                <RotateCw className="h-3.5 w-3.5" /> Rotate image
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
          </div>

          {/* RIGHT — live 3D preview + settings */}
          <div className="min-w-0 flex flex-col bg-muted/20 overflow-hidden">
            <div className="flex-1 min-h-[300px] p-5 pb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                How it will look on the wall
              </p>
              <div className="w-full h-[calc(100%-1.5rem)]">
                {previewTransform && imgEl ? (
                  <Canvas3DPreview image={imgEl} state={previewTransform} />
                ) : (
                  <div className="w-full h-full rounded-lg bg-gradient-to-br from-neutral-100 to-neutral-200 border flex items-center justify-center text-sm text-muted-foreground">
                    Loading preview…
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-border p-5 space-y-5 overflow-y-auto max-h-[45%]">
              <div className="grid grid-cols-2 gap-4">
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
                  <Label className="text-xs font-semibold uppercase tracking-wide">Orientation</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setOrientation("landscape")}
                      className={`border rounded-md py-1.5 text-xs font-medium transition ${orientation === "landscape" ? "border-primary bg-primary/10" : "hover:border-primary/40"}`}
                    >
                      Landscape
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientation("portrait")}
                      className={`border rounded-md py-1.5 text-xs font-medium transition ${orientation === "portrait" ? "border-primary bg-primary/10" : "hover:border-primary/40"}`}
                    >
                      Portrait
                    </button>
                  </div>
                </div>
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
                <div className="grid grid-cols-2 gap-1.5">
                  {WRAP_MODE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`block border rounded-md p-2 cursor-pointer text-xs transition ${wrapMode === opt.value ? "border-primary bg-primary/10" : "hover:border-primary/40"}`}
                      title={opt.help}
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
                    </label>
                  ))}
                </div>
                {wrapMode === "colour_wrap" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Label className="text-xs">Colour</Label>
                    <DebouncedColorInput
                      value={wrapColorHex ?? "#ffffff"}
                      onChange={(v) => setWrapColorHex(v)}
                    />
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {WRAP_MODE_OPTIONS.find((o) => o.value === wrapMode)?.help}
                </p>
              </div>
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
