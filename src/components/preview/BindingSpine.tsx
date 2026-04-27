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
    const method = (bindingArt?.method ?? bindingTypeToMethod(bindingType))!;
    const requestedColor = normaliseBindingColor(bindingArt?.color);
    const edge: "long" | "short" = bindingEdge === "top" ? "short" : "long";
    const state = isOpen ? "open" : "closed";

    // Try the exact requested tuple first. If artwork is missing for the
    // requested colour (e.g. a newly-seeded option without art yet), fall
    // back to the same method in BLACK so the spine still renders, then
    // log a clear warning instead of returning null and disappearing.
    let spineImage: string | null = null;
    try {
      spineImage = resolveBindingArt({ method, color: requestedColor, edge, state }).src;
    } catch (err) {
      console.warn(
        `[BindingSpine] Falling back to black: ${(err as Error).message}`,
      );
      try {
        spineImage = resolveBindingArt({ method, color: "black", edge, state }).src;
      } catch (innerErr) {
        console.error("[BindingSpine] No fallback artwork either:", innerErr);
        return null;
      }
    }

    return (
      <div
        className="absolute top-0 z-30 pointer-events-none overflow-hidden"
        style={{
          ...positionStyle,
          width: 36,
          height,
        }}
      >
        <img
          src={spineImage}
          alt=""
          aria-hidden="true"
          className="block w-full h-full"
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
