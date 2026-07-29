import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { requiredPixels } from "@/lib/canvasPrints/presets";
import type { CanvasTransformState } from "@/lib/canvasPrints/types";

interface Props {
  state: CanvasTransformState;
}

export default function ResolutionBadge({ state }: Props) {
  if (!state.imageNaturalWidth || !state.imageNaturalHeight) return null;
  const req = requiredPixels(state.frontWidthMm, state.frontHeightMm, state.wrapMm, state.bleedMm, state.dpi);
  const uploadedShort = Math.min(state.imageNaturalWidth, state.imageNaturalHeight);
  const requiredShort = Math.min(req.width, req.height);
  // Estimate effective DPI at the current scale.
  const effectiveDpi = Math.round((state.imageNaturalWidth / (state.frontWidthMm + (state.wrapMm + state.bleedMm) * 2)) * 25.4 * state.imageScale);
  const ok = uploadedShort * state.imageScale >= requiredShort * 0.85;

  return (
    <div className={`rounded-md border p-3 flex items-start gap-2 text-sm ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
      {ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
      <div className="space-y-0.5">
        <p className="font-medium">
          {ok ? "Image resolution looks good." : "Your image may print soft at this size."}
        </p>
        <p className="text-xs">
          Uploaded {state.imageNaturalWidth} × {state.imageNaturalHeight} px · Recommended {req.width} × {req.height} px at {state.dpi} DPI ·
          Effective ≈ {effectiveDpi} DPI.
        </p>
        {!ok && (
          <p className="text-xs">
            You can still order, but fine detail may not be sharp. Consider a smaller canvas size or a higher-resolution image.
          </p>
        )}
      </div>
    </div>
  );
}
