import type { BindingType } from "./previewTypes";

import coilClosedImg from "@/assets/bindings/coil_binding_black_closed.png";
import coilOpenImg from "@/assets/bindings/coil_binding_black_open.png";
import wireClosedImg from "@/assets/bindings/wire_binding_black_closed.png";
import wireOpenImg from "@/assets/bindings/wire_binding_black_open.png";

interface BindingSpineProps {
  bindingType: BindingType;
  height: number;
  /** Whether the book is open (showing a two-page spread) */
  isOpen?: boolean;
  /** Horizontal placement: left edge, center (spread), or right edge */
  position?: "left" | "center" | "right";
}

export default function BindingSpine({ bindingType, height, isOpen = false, position = "center" }: BindingSpineProps) {
  if (bindingType === "none") return null;

  const positionStyle: React.CSSProperties =
    position === "left"
      ? { left: 0, transform: "translateX(-50%)" }
      : position === "right"
        ? { right: 0, transform: "translateX(50%)" }
        : { left: "50%", transform: "translateX(-50%)" };

  const isSpiral = bindingType === "coil" || bindingType === "wire" || bindingType === "comb";

  if (isSpiral) {
    // Pick the correct image based on binding type and open/closed state
    let spineImage: string;
    if (bindingType === "wire") {
      spineImage = isOpen ? wireOpenImg : wireClosedImg;
    } else {
      // coil and comb both use coil images for now
      spineImage = isOpen ? coilOpenImg : coilClosedImg;
    }

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
          alt={`${bindingType} binding`}
          className="w-full h-full object-fill"
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
