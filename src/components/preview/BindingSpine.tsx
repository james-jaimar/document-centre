import type { BindingType } from "./previewTypes";
import {
  resolveBindingArt,
  normaliseBindingColor,
  type BindingArtMethod,
} from "./bindingAssets";

interface BindingSpineProps {
  bindingType: BindingType;
  height: number;
  /** Whether the book is open (showing a two-page spread) */
  isOpen?: boolean;
  /** Horizontal placement: left edge, center (spread), or right edge */
  position?: "left" | "center" | "right";
  /** Binding edge: left (default) or top (horizontal spine for presentations) */
  bindingEdge?: "left" | "top";
  /**
   * Selected binding option's method + colour. When provided, drives the
   * spine artwork selection; otherwise we fall back to the method's default
   * (black) colour. `bindingType` still controls whether a spine renders at
   * all (saddle/perfect/ring/none paths are unchanged).
   */
  bindingArt?: { method: BindingArtMethod; color: string };
}

/** Map FlipBook's `BindingType` to the asset registry's method key. */
function bindingTypeToMethod(t: BindingType): BindingArtMethod | null {
  if (t === "coil") return "spiral";
  if (t === "wire") return "twin_loop";
  if (t === "comb") return "comb";
  return null;
}

export default function BindingSpine({
  bindingType,
  height,
  isOpen = false,
  position = "center",
  bindingEdge = "left",
  landscapeLongEdge = false,
  bindingArt,
}: BindingSpineProps) {
  if (bindingType === "none" || bindingType === "ring") return null;

  const positionStyle: React.CSSProperties =
    position === "left"
      ? { left: 0, transform: "translateX(-50%)" }
      : position === "right"
        ? { right: 0, transform: "translateX(50%)" }
        : { left: "50%", transform: "translateX(-50%)" };

  const isSpiral = bindingType === "coil" || bindingType === "wire" || bindingType === "comb";

  if (isSpiral) {
    // Prefer the explicit bindingArt method; fall back to one inferred from
    // bindingType so legacy callers still render.
    const method = (bindingArt?.method ?? bindingTypeToMethod(bindingType))!;
    const color = normaliseBindingColor(bindingArt?.color);

    // Edge selection:
    //  - bindingEdge==="top" + landscapeLongEdge → dedicated horizontal
    //    landscape ("top") artwork. The outer FlipBook container is rotated
    //    90° in this mode, so a vertical strip drawn here visually appears
    //    as a horizontal spine between the two stacked landscape pages.
    //  - bindingEdge==="top" alone (short-edge landscape bind) → 210mm
    //    short-edge artwork in a normal vertical spine (no rotation).
    //  - bindingEdge==="left" → traditional portrait long-edge spine.
    const edge: "long" | "short" | "top" =
      bindingEdge === "top" && landscapeLongEdge
        ? "top"
        : bindingEdge === "top"
          ? "short"
          : "long";
    const state = isOpen ? "open" : "closed";

    const { src: spineImage } = resolveBindingArt({ method, color, edge, state });

    return (
      <div
        className="absolute top-0 z-30 pointer-events-none"
        style={{
          ...positionStyle,
          width: 36,
          height,
        }}
      >
        <img
          src={spineImage}
          alt={`${method} ${color} binding`}
          className="w-full h-full"
          style={{ objectFit: "fill" }}
          draggable={false}
        />
      </div>
    );
  }

  // Saddle stitch or perfect bound — subtle crease/groove
  const spineWidth = bindingType === "perfect" ? 10 : 6;

  return (
      <div
        className="absolute top-0 z-20 pointer-events-none"
        style={{
          ...positionStyle,
          width: spineWidth,
          height,
        }}
      >
      <div
        className="absolute inset-0"
        style={{
          background:
            bindingType === "saddle"
              ? "linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.06) 100%)"
              : "linear-gradient(90deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.08) 100%)",
        }}
      />

      {/* Saddle stitch marks */}
      {bindingType === "saddle" && (
        <div className="absolute inset-0 flex flex-col justify-evenly items-center py-8">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="bg-muted-foreground/40"
              style={{ width: 2, height: 12, borderRadius: 1 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
