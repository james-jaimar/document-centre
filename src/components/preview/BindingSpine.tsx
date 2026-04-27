import type { BindingType } from "./previewTypes";
import {
  getBindingImage,
  normaliseBindingColor,
  type BindingMethod,
} from "./bindingAssets";

interface BindingSpineProps {
  bindingType: BindingType;
  height: number;
  /** Whether the book is open (showing a two-page spread) */
  isOpen?: boolean;
  /** Horizontal placement: left edge, center (spread), or right edge */
  position?: "left" | "center" | "right";
  /** Binding edge: left (portrait long edge) or top (landscape short edge) */
  bindingEdge?: "left" | "top";
  /** Selected binding option's method + colour. */
  bindingArt?: { method: BindingMethod; color: string };
}

function bindingTypeToMethod(t: BindingType): BindingMethod | null {
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

  const isSpiral =
    bindingType === "coil" || bindingType === "wire" || bindingType === "comb";

  // Saddle stitch / perfect bound — subtle crease/groove (no PNG art).
  if (!isSpiral) {
    const spineWidth = bindingType === "perfect" ? 10 : 6;
    return (
      <div
        className="absolute top-0 z-20 pointer-events-none"
        style={{ ...positionStyle, width: spineWidth, height }}
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

  // Coil / Wire / Comb — direct image lookup.
  const method = bindingArt?.method ?? bindingTypeToMethod(bindingType)!;
  const color = normaliseBindingColor(bindingArt?.color);
  const orientation = bindingEdge === "top" ? "landscape" : "portrait";
  const state = isOpen ? "open" : "closed";

  const src = getBindingImage({ method, color, orientation, state });

  if (!src) {
    if (import.meta.env.DEV) {
      console.warn(
        `[BindingSpine] No PNG registered for method="${method}" color="${color}" orientation="${orientation}" state="${state}"`,
      );
    }
    return null;
  }

  return (
    <div
      className="absolute top-0 z-30 pointer-events-none overflow-hidden"
      style={{ ...positionStyle, width: 36, height }}
    >
      <img
        src={src}
        alt={`${method} ${color} binding`}
        aria-hidden="true"
        className="block w-full h-full"
        style={{ objectFit: "fill" }}
        draggable={false}
      />
    </div>
  );
}
