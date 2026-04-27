import { useCallback, useEffect, useMemo, useState } from "react";
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
import { RotateCw, RotateCcw } from "lucide-react";
import type { CroppedAreaPixels } from "@/lib/photoPrints/types";

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

export interface PosterEditorResult {
  size: PosterSizeChoice;
  /** Final orientation as displayed in the editor (after auto-rotate). */
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
  /** Source image file the user just uploaded. */
  file: File | null;
  /** Optional pre-selected size (e.g. from an already-set poster size). */
  initialSizeSlug?: string;
  /** Optional full state to seed when re-editing an existing poster image. */
  initialState?: PosterEditorInitialState;
  /** Title shown in the dialog header. */
  title?: string;
  onCancel: () => void;
  onConfirm: (result: PosterEditorResult) => void;
}

/**
 * Lets the user crop / position / rotate an uploaded image to a chosen poster
 * size before it is rasterised into a print-ready PDF. Mirrors the Photo Prints
 * editor UX but without the white-border overlay (posters print edge-to-edge)
 * and with a built-in poster size picker.
 */
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
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CroppedAreaPixels | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);
  const hasInitialState = !!initialState;

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
    if (initialState?.orientation) setOrientation(initialState.orientation);
  }, [open, initialSizeSlug, initialState]);

  // Auto-pick orientation to match the source image's natural aspect — but
  // only when we don't have a saved orientation to honour (re-edit case).
  useEffect(() => {
    if (!imageDims || hasInitialState) return;
    setOrientation(imageDims.w >= imageDims.h ? "landscape" : "portrait");
  }, [imageDims, hasInitialState]);

  const sizeChoice = useMemo(
    () => POSTER_SIZE_CHOICES.find((s) => s.slug === sizeSlug) ?? POSTER_SIZE_CHOICES[2],
    [sizeSlug],
  );

  const aspect = useMemo(() => {
    const w = orientation === "landscape" ? Math.max(sizeChoice.widthMm, sizeChoice.heightMm) : Math.min(sizeChoice.widthMm, sizeChoice.heightMm);
    const h = orientation === "landscape" ? Math.min(sizeChoice.widthMm, sizeChoice.heightMm) : Math.max(sizeChoice.widthMm, sizeChoice.heightMm);
    return w / h;
  }, [sizeChoice, orientation]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

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
          <DialogTitle className="text-lg">Crop & position your poster</DialogTitle>
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

        {/* Cropper area */}
        <div className="relative w-full bg-black" style={{ height: 420 }}>
          {imageUrl ? (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              objectFit="cover"
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              minZoom={1}
              maxZoom={4}
              zoomSpeed={0.5}
              restrictPosition
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
            <Slider value={[zoom]} min={1} max={4} step={0.01} onValueChange={(v) => setZoom(v[0])} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRotation((r) => (r + 270) % 360)}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Rotate -90°
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="gap-1.5"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Rotate +90°
            </Button>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!croppedAreaPixels || !imageUrl}>
            Use this image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
