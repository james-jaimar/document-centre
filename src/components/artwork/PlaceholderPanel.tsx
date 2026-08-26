/**
 * Customer-side controls for one placeholder (image upload + framing, or text).
 */
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Loader2, ImageIcon, Type, Upload, Trash2, Smartphone } from "lucide-react";
import {
  GOOD_PLACEMENT_DPI,
  MIN_PLACEMENT_DPI,
  placementDpi,
  type ArtworkPlaceholder,
  type TemplatedImageValue,
  type TemplatedPlaceholderValue,
  type TemplatedTextValue,
} from "@/lib/artworkTemplates/types";

interface Props {
  placeholder: ArtworkPlaceholder;
  value: TemplatedPlaceholderValue | undefined;
  busy?: boolean;
  active?: boolean;
  onFocus: () => void;
  onPickFile: (file: File) => void;
  onPhoneUpload?: () => void;
  onChange: (value: TemplatedPlaceholderValue) => void;
  onClear: () => void;
}

export default function PlaceholderPanel({
  placeholder,
  value,
  busy,
  active,
  onFocus,
  onPickFile,
  onPhoneUpload,
  onChange,
  onClear,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (placeholder.kind === "text") {
    const v = value as TemplatedTextValue | undefined;
    return (
      <div
        onFocus={onFocus}
        className={`space-y-2 rounded-lg border p-3 ${active ? "border-primary" : ""}`}
      >
        <Label className="flex items-center gap-2 text-sm font-medium">
          <Type className="h-4 w-4" /> {placeholder.name}
          {placeholder.is_required && <Badge variant="outline" className="text-[10px]">Required</Badge>}
        </Label>
        <Input
          value={v?.value ?? placeholder.default_value ?? ""}
          maxLength={placeholder.max_length ?? undefined}
          placeholder={placeholder.default_value ?? "Your text…"}
          onChange={(e) =>
            onChange({ placeholder_id: placeholder.id, kind: "text", value: e.target.value })
          }
        />
        {placeholder.max_length && (
          <p className="text-xs text-muted-foreground">
            {(v?.value ?? "").length}/{placeholder.max_length} characters
          </p>
        )}
      </div>
    );
  }

  const v = value as TemplatedImageValue | undefined;
  const dpi = v ? effectivePlacementDpi(v, placeholder.width_mm, placeholder.height_mm) : 0;
  const isVector = !!v?.source_was_pdf;
  const dpiTone =
    dpi >= GOOD_PLACEMENT_DPI ? "default" : dpi >= MIN_PLACEMENT_DPI ? "secondary" : "destructive";


  return (
    <div
      onClick={onFocus}
      className={`space-y-3 rounded-lg border p-3 ${active ? "border-primary" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2 text-sm font-medium">
          <ImageIcon className="h-4 w-4" /> {placeholder.name}
          {placeholder.is_required && <Badge variant="outline" className="text-[10px]">Required</Badge>}
        </Label>
        {v && (
          <Button size="icon" variant="ghost" onClick={onClear}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          if (fileRef.current) fileRef.current.value = "";
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
          {v ? "Replace" : "Upload"}
        </Button>
        {onPhoneUpload && (
          <Button size="sm" variant="ghost" onClick={onPhoneUpload} disabled={busy}>
            <Smartphone className="h-4 w-4 mr-1.5" /> From phone
          </Button>
        )}
      </div>

      {v && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="truncate text-xs text-muted-foreground">{v.file_name}</span>
            <Badge variant={dpiTone as any} className="ml-auto text-[10px]">
              {dpi} DPI
            </Badge>
          </div>
          {dpi < MIN_PLACEMENT_DPI && (
            <p className="text-xs text-destructive">
              Low resolution for this box — the print may look soft.
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Zoom</Label>
            <Slider
              min={1}
              max={3}
              step={0.01}
              value={[v.scale]}
              onValueChange={([s]) => onChange({ ...v, scale: s })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Move ↔</Label>
              <Slider
                min={-1}
                max={1}
                step={0.01}
                value={[v.offset_x]}
                onValueChange={([n]) => onChange({ ...v, offset_x: n })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Move ↕</Label>
              <Slider
                min={-1}
                max={1}
                step={0.01}
                value={[v.offset_y]}
                onValueChange={([n]) => onChange({ ...v, offset_y: n })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={v.fit === "fill" ? "default" : "outline"}
              onClick={() => onChange({ ...v, fit: "fill", scale: 1, offset_x: 0, offset_y: 0 })}
            >
              Fill box
            </Button>
            <Button
              size="sm"
              variant={v.fit === "fit" ? "default" : "outline"}
              onClick={() => onChange({ ...v, fit: "fit", scale: 1, offset_x: 0, offset_y: 0 })}
            >
              Fit inside
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
