/**
 * Customer-side controls for one placeholder (image upload + framing, or text).
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, ImageIcon, Type, Upload, Trash2, Check, Palette } from "lucide-react";
import {
  DEFAULT_CMYK,
  GOOD_PLACEMENT_DPI,
  MIN_PLACEMENT_DPI,
  cmykToHex,
  effectivePlacementDpi,
  normaliseCmyk,
  type ArtworkPlaceholder,
  type TemplatedColourValue,
  type TemplatedImageValue,
  type TemplatedPlaceholderValue,
  type TemplatedTextValue,
} from "@/lib/artworkTemplates/types";


interface Props {
  placeholder: ArtworkPlaceholder;
  value: TemplatedPlaceholderValue | undefined;
  busy?: boolean;
  active?: boolean;
  /** 1-based position, shown as a step chip so the eye has an entry point. */
  step?: number;
  onFocus: () => void;
  onPickFile: (file: File) => void;
  onChange: (value: TemplatedPlaceholderValue) => void;
  onClear: () => void;
}

/** Shell shared by the text and image cards — carries all the contrast cues. */
function CardShell({
  children,
  active,
  filled,
  required,
  onFocus,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  filled: boolean;
  required: boolean;
  onFocus?: () => void;
  onClick?: () => void;
}) {
  return (
    <div
      onFocus={onFocus}
      onClick={onClick}
      className={cn(
        "space-y-3 rounded-xl border-2 p-4 transition-colors",
        filled
          ? "border-border bg-card"
          : required
            ? "border-primary/50 bg-primary/5"
            : "border-border bg-card",
        active && "border-primary ring-2 ring-primary/25",
      )}
    >
      {children}
    </div>
  );
}

function StepChip({ step, done }: { step?: number; done: boolean }) {
  if (done) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
      {step ?? "•"}
    </span>
  );
}

export default function PlaceholderPanel({
  placeholder,
  value,
  busy,
  active,
  step,
  onFocus,
  onPickFile,
  onChange,
  onClear,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  if (placeholder.kind === "colour") {
    const v = value as TemplatedColourValue | undefined;
    const cmyk = normaliseCmyk(v?.cmyk ?? placeholder.default_cmyk ?? DEFAULT_CMYK);
    const editable = placeholder.customer_editable_colour !== false;

    return (
      <CardShell active={active} filled required={false} onFocus={onFocus} onClick={onFocus}>
        <div className="flex items-center gap-2">
          <StepChip step={step} done />
          <Label className="flex flex-1 items-center gap-1.5 text-base font-semibold text-foreground">
            <Palette className="h-4 w-4 text-primary" />
            {placeholder.name}
          </Label>
          <span
            className="h-6 w-10 shrink-0 rounded border"
            style={{ background: cmykToHex(cmyk) }}
          />
        </div>

        {editable ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              {(["c", "m", "y", "k"] as const).map((ch) => (
                <div key={ch} className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase text-muted-foreground">
                    {ch}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={cmyk[ch]}
                    className="h-10 border-2 text-center text-base"
                    onChange={(e) =>
                      onChange({
                        placeholder_id: placeholder.id,
                        kind: "colour",
                        cmyk: normaliseCmyk({ ...cmyk, [ch]: Number(e.target.value) }),
                        opacity: v?.opacity ?? placeholder.opacity ?? 1,
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Enter your CMYK ink values (0–100). The swatch is a screen approximation — printing
              uses the exact values.
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Fixed colour: C {cmyk.c} · M {cmyk.m} · Y {cmyk.y} · K {cmyk.k}
          </p>
        )}
      </CardShell>
    );
  }

  if (placeholder.kind === "text") {

    const v = value as TemplatedTextValue | undefined;
    const text = v?.value ?? placeholder.default_value ?? "";
    const filled = text.trim().length > 0;

    return (
      <CardShell active={active} filled={filled} required={!!placeholder.is_required} onFocus={onFocus}>
        <div className="flex items-center gap-2">
          <StepChip step={step} done={filled} />
          <Label className="flex flex-1 items-center gap-1.5 text-base font-semibold text-foreground">
            <Type className="h-4 w-4 text-primary" />
            {placeholder.name}
          </Label>
          {placeholder.is_required && !filled && (
            <Badge className="bg-primary text-primary-foreground text-[10px]">Required</Badge>
          )}
        </div>

        <Input
          value={text}
          maxLength={placeholder.max_length ?? undefined}
          placeholder={placeholder.default_value ?? "Type your text here…"}
          className={cn(
            "h-11 border-2 text-base",
            !filled && placeholder.is_required && "border-primary/50 bg-background",
          )}
          onChange={(e) =>
            onChange({ placeholder_id: placeholder.id, kind: "text", value: e.target.value })
          }
        />

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">
            Opacity ({Math.round((v?.opacity ?? placeholder.opacity ?? 1) * 100)}%)
          </Label>
          <Slider
            min={0.05}
            max={1}
            step={0.05}
            value={[v?.opacity ?? placeholder.opacity ?? 1]}
            onValueChange={([o]) =>
              onChange({
                placeholder_id: placeholder.id,
                kind: "text",
                value: text,
                opacity: o,
              })
            }
          />
        </div>

        {placeholder.max_length && (
          <p className="text-xs text-muted-foreground">
            {text.length}/{placeholder.max_length} characters
          </p>
        )}
      </CardShell>
    );
  }

  const v = value as TemplatedImageValue | undefined;
  const dpi = v ? effectivePlacementDpi(v, placeholder.width_mm, placeholder.height_mm) : 0;
  const isVector = !!v?.source_was_pdf;
  const dpiTone =
    dpi >= GOOD_PLACEMENT_DPI ? "default" : dpi >= MIN_PLACEMENT_DPI ? "secondary" : "destructive";

  return (
    <CardShell active={active} filled={!!v} required={!!placeholder.is_required} onClick={onFocus}>
      <div className="flex items-center gap-2">
        <StepChip step={step} done={!!v} />
        <Label className="flex flex-1 items-center gap-1.5 text-base font-semibold text-foreground">
          <ImageIcon className="h-4 w-4 text-primary" />
          {placeholder.name}
        </Label>
        {placeholder.is_required && !v && (
          <Badge className="bg-primary text-primary-foreground text-[10px]">Required</Badge>
        )}
        {v && (
          <Button size="icon" variant="ghost" onClick={onClear} aria-label="Remove image">
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

      {!v ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onPickFile(f);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors",
            dragOver
              ? "border-primary bg-primary/15"
              : "border-primary/50 bg-primary/5 hover:border-primary hover:bg-primary/10",
            busy && "opacity-60",
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
          </span>
          <span className="text-sm font-semibold text-foreground">
            {busy ? "Uploading…" : "Click to upload your file"}
          </span>
          <span className="text-xs text-muted-foreground">
            or drag &amp; drop · JPG, PNG, WEBP or PDF
          </span>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
            <span className="truncate text-xs font-medium text-foreground">{v.file_name}</span>
            {isVector ? (
              <Badge variant="secondary" className="ml-auto text-[10px]">PDF · vector</Badge>
            ) : (
              <Badge variant={dpiTone as any} className="ml-auto text-[10px]">
                {dpi} DPI
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5">Replace</span>
            </Button>
          </div>

          {!isVector && dpi < MIN_PLACEMENT_DPI && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              Low resolution at this size — the print may look soft. Zoom out or supply a larger file.
            </p>
          )}

          {placeholder.is_watermark ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Watermark strength</Label>
              <div className="flex gap-2">
                {[0.05, 0.1].map((o) => {
                  const current = Math.min(v.opacity ?? 0.1, 0.1);
                  const selected = Math.abs(current - o) < 0.001;
                  return (
                    <Button
                      key={o}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => onChange({ ...v, opacity: o })}
                    >
                      {Math.round(o * 100)}%
                    </Button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Watermarks print at 10% maximum so the artwork underneath stays readable.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">
                Opacity ({Math.round((v.opacity ?? placeholder.opacity ?? 1) * 100)}%)
              </Label>
              <Slider
                min={0.05}
                max={1}
                step={0.05}
                value={[v.opacity ?? placeholder.opacity ?? 1]}
                onValueChange={([o]) => onChange({ ...v, opacity: o })}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Zoom</Label>
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
              <Label className="text-xs font-medium text-foreground">Move ↔</Label>
              <Slider
                min={-1}
                max={1}
                step={0.01}
                value={[v.offset_x]}
                onValueChange={([n]) => onChange({ ...v, offset_x: n })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Move ↕</Label>
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
    </CardShell>
  );
}
