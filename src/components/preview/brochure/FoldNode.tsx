import type { Panel } from "./brochure-types";

interface FoldNodeProps {
  panel: Panel;
  rotationY: number;
  width: number;
  height: number;
  /** Child attached at the LEFT edge (panel to the left of this one) */
  leftChild?: React.ReactNode;
  /** Child attached at the RIGHT edge (panel to the right of this one) */
  rightChild?: React.ReactNode;
}

/**
 * A single panel with front/back faces using CSS 3D transforms.
 * Children are attached at left or right edges to form hinge chains.
 */
export default function FoldNode({
  panel,
  rotationY,
  width,
  height,
  leftChild,
  rightChild,
}: FoldNodeProps) {
  const isFolded = Math.abs(rotationY) > 10;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
        transformStyle: "preserve-3d",
        transformOrigin: "left center",
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
      {isFolded && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 16,
            height: "100%",
            pointerEvents: "none",
            background:
              "linear-gradient(to right, rgba(0,0,0,0.12), transparent)",
            zIndex: 30,
          }}
        />
      )}

      {/* Left child positioned at left edge, hinged from right */}
      {leftChild && (
        <div
          style={{
            position: "absolute",
            right: width, // place to the left
            top: 0,
            transformStyle: "preserve-3d",
            transformOrigin: "right center",
          }}
        >
          {leftChild}
        </div>
      )}

      {/* Right child positioned at right edge */}
      {rightChild && (
        <div
          style={{
            position: "absolute",
            left: width,
            top: 0,
            transformStyle: "preserve-3d",
          }}
        >
          {rightChild}
        </div>
      )}
    </div>
  );
}
