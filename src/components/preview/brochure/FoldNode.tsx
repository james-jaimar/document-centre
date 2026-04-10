import type { Panel } from "./brochure-types";

interface FoldNodeProps {
  panel: Panel;
  width: number;
  height: number;
  /** CSS left position */
  left: number;
  /** Current rotation in degrees */
  rotationY: number;
  /** Which edge this panel hinges on */
  hingeEdge: "left" | "right" | "none";
}

/**
 * A single panel with front/back faces using CSS 3D transforms.
 * No child nesting — all panels are flat siblings in the stage.
 */
export default function FoldNode({
  panel,
  width,
  height,
  left,
  rotationY,
  hingeEdge,
}: FoldNodeProps) {
  const isFolded = Math.abs(rotationY) > 10;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top: 0,
        width,
        height,
        transformStyle: "preserve-3d",
        transformOrigin: hingeEdge === "none" ? "center center" : `${hingeEdge} center`,
        transform: `rotateY(${rotationY}deg)`,
        transition: "transform 700ms ease",
        zIndex: isFolded ? 20 : 10,
      }}
    >
      {/* Front face */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backfaceVisibility: "hidden",
          overflow: "hidden",
          background: "hsl(var(--background))",
          border: "1px solid hsl(var(--border))",
          boxShadow: isFolded
            ? "0 8px 24px rgba(0,0,0,0.18)"
            : "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        {panel.front.imageUrl ? (
          <img
            src={panel.front.imageUrl}
            alt=""
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: panel.front.backgroundColor || "hsl(var(--muted))",
              color: "hsl(var(--muted-foreground))",
              fontSize: 12,
            }}
          >
            {panel.front.label || panel.id}
          </div>
        )}
      </div>

      {/* Back face (rotated 180° so it shows when flipped) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backfaceVisibility: "hidden",
          overflow: "hidden",
          transform: "rotateY(180deg)",
          background: "hsl(var(--background))",
          border: "1px solid hsl(var(--border))",
          boxShadow: isFolded
            ? "0 8px 24px rgba(0,0,0,0.18)"
            : "0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        {panel.back.imageUrl ? (
          <img
            src={panel.back.imageUrl}
            alt=""
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: panel.back.backgroundColor || "hsl(var(--muted))",
              color: "hsl(var(--muted-foreground))",
              fontSize: 12,
            }}
          >
            {panel.back.label || `${panel.id} back`}
          </div>
        )}
      </div>

      {/* Fold-edge shadow (visible when folded) */}
      {isFolded && hingeEdge !== "none" && (
        <div
          style={{
            position: "absolute",
            top: 0,
            [hingeEdge]: 0,
            width: 16,
            height: "100%",
            pointerEvents: "none",
            background:
              hingeEdge === "left"
                ? "linear-gradient(to right, rgba(0,0,0,0.12), transparent)"
                : "linear-gradient(to left, rgba(0,0,0,0.12), transparent)",
            zIndex: 30,
          }}
        />
      )}
    </div>
  );
}
