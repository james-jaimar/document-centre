import type { PreviewEffects } from "./previewTypes";

/**
 * Map paper color slugs to CSS background colors
 */
const PAPER_COLORS: Record<string, string> = {
  white: "#ffffff",
  pastel_blue: "#dbeafe",
  pastel_green: "#dcfce7",
  pastel_yellow: "#fef9c3",
  pastel_pink: "#fce7f3",
};

/**
 * Map back cover types to CSS background colors
 */
const BACK_COVER_COLORS: Record<string, string> = {
  black_card: "#1a1a1a",
  white_card: "#f5f5f5",
  navy_card: "#1e3a5f",
  silk_card: "#fafafa",
  gloss_card: "#f0f0f0",
};

/** Inset shadow for paper pages — purely cosmetic, zero layout impact */
const PAPER_SHADOW = "inset 0 0 0 1px rgba(0,0,0,0.12), inset 0 0 6px rgba(0,0,0,0.06)";

/** Roles that are solid card material (edge-to-edge, no paper styling) */
const CARD_ROLES = new Set(["inside_back_cover_card", "back_cover_card"]);

/** Roles that are blank paper faces */
const BLANK_PAPER_ROLES = new Set(["blank_back", "inside_back_blank"]);

interface PageEffectsProps {
  effects: PreviewEffects;
  pageIndex: number;
  totalPages: number;
  children: React.ReactNode;
  /** Explicit page role */
  pageRole?: string;
  /** Whether this face renders edge-to-edge (no white margin) — computed upstream */
  allowBleed: boolean;
  /** Fixed pixel inset for non-bleed pages */
  bleedInsetPx: number;
}

/**
 * Single source of truth for all page visual treatment.
 *
 * Every page slot renders through ONE of these branches:
 * 1. Card material — solid color, edge-to-edge, no children
 * 2. PVC cover back — translucent reverse face, no children
 * 3. PVC cover front — children (artwork) + PVC overlay
 * 4. Blank paper — paper color + shadow, no children
 * 5. Standard paper — paper color + shadow + optional bleed padding + children
 */
export default function PageEffects({ effects, pageIndex, totalPages, children, pageRole, allowBleed, bleedInsetPx }: PageEffectsProps) {
  const role = pageRole ?? (pageIndex === 0 ? "front_cover" : "body");

  // ── 1. Card material: solid edge-to-edge color ──
  if (CARD_ROLES.has(role)) {
    const cardColor = BACK_COVER_COLORS[effects.backCover] ?? "#1a1a1a";
    return (
      <div className="w-full h-full" style={{ backgroundColor: cardColor }} />
    );
  }

  // ── 2. PVC cover back: translucent reverse ──
  if (role === "pvc_cover_back") {
    return (
      <div className="w-full h-full" style={{ backgroundColor: "rgba(240,240,240,0.6)" }}>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(200,200,200,0.1) 100%)",
            boxShadow: "inset 0 0 30px rgba(0,0,0,0.03)",
          }}
        />
      </div>
    );
  }

  // ── 3. PVC cover front: artwork + PVC overlay ──
  if (role === "pvc_cover_front") {
    return (
      <div className="w-full h-full relative">
        {/* Artwork image rendered by FlipBook as children */}
        {children}
        {/* PVC overlay */}
        {effects.frontCover === "clear_pvc" && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "rgba(255,255,255,0.12)",
              boxShadow: "inset 0 0 20px rgba(255,255,255,0.1)",
            }}
          />
        )}
        {effects.frontCover === "frosted_pvc" && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "rgba(255,255,255,0.35)",
              backdropFilter: "blur(1.5px)",
              WebkitBackdropFilter: "blur(1.5px)",
            }}
          />
        )}
        {effects.frontCover === "matte_pvc" && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "rgba(255,255,255,0.25)",
              backdropFilter: "blur(0.5px)",
              WebkitBackdropFilter: "blur(0.5px)",
            }}
          />
        )}
      </div>
    );
  }

  // ── 4. Blank paper: paper color + shadow, no content ──
  if (BLANK_PAPER_ROLES.has(role)) {
    const paperBg = PAPER_COLORS[effects.paperColor] ?? "#ffffff";
    return (
      <div className="w-full h-full" style={{ backgroundColor: paperBg, boxShadow: PAPER_SHADOW }}>
        {effects.holePunch > 0 && <HolePunchMarks count={effects.holePunch as 2 | 4} />}
      </div>
    );
  }

  // ── 5. Standard paper page (front_cover, body, etc.) ──
  const paperBg = PAPER_COLORS[effects.paperColor] ?? "#ffffff";

  // Bleed: use the explicit upstream flag and fixed pixel inset
  const bleedPadding = allowBleed ? undefined : `${bleedInsetPx}px`;

  // Lamination sheen on front cover only (not PVC — that's a separate material)
  const showLamination = role === "front_cover" && effects.coverLamination !== "none";

  return (
    <div className="w-full h-full relative" style={{ backgroundColor: paperBg, boxShadow: PAPER_SHADOW }}>
      {/* Single content wrapper — consistent for ALL standard pages */}
      <div
        className="w-full h-full"
        style={bleedPadding ? { padding: bleedPadding, boxSizing: "border-box" } : undefined}
      >
        {children}
      </div>

      {/* Cover lamination sheen */}
      {showLamination && effects.coverLamination === "gloss" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(135deg, transparent 25%, rgba(255,255,255,0.25) 45%, rgba(255,255,255,0.05) 55%, transparent 75%)",
          }}
        />
      )}
      {showLamination && effects.coverLamination === "matt" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)",
          }}
        />
      )}
      {showLamination && effects.coverLamination === "soft_touch" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(160deg, transparent 20%, rgba(255,255,255,0.06) 40%, rgba(0,0,0,0.03) 60%, transparent 80%)",
          }}
        />
      )}

      {/* Hole punch marks */}
      {effects.holePunch > 0 && <HolePunchMarks count={effects.holePunch as 2 | 4} />}
    </div>
  );
}

function HolePunchMarks({ count }: { count: 2 | 4 }) {
  const positions = count === 2 ? [33, 67] : [20, 40, 60, 80];
  return (
    <>
      {positions.map((pct) => (
        <div
          key={pct}
          className="absolute pointer-events-none"
          style={{
            left: "3%",
            top: `${pct}%`,
            width: "2.5%",
            height: 0,
            paddingBottom: "2.5%",
            borderRadius: "50%",
            backgroundColor: "rgba(0,0,0,0.15)",
            border: "1px solid rgba(0,0,0,0.2)",
            transform: "translateY(-50%)",
          }}
        />
      ))}
    </>
  );
}
