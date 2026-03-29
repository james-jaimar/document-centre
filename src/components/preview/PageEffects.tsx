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

interface PageEffectsProps {
  effects: PreviewEffects;
  pageIndex: number;
  totalPages: number;
  children: React.ReactNode;
  /** Explicit page role: "front_cover", "body", "back_cover_card", "blank" */
  pageRole?: string;
}

/**
 * Wraps a page's content and applies visual finishing effects:
 * - Bleed margin (white border when bleed is off)
 * - PVC cover overlays (clear, frosted, matte)
 * - Colored back cover
 * - Paper tint
 * - Hole punch marks
 * - Cover lamination sheen
 */
export default function PageEffects({ effects, pageIndex, totalPages, children, pageRole }: PageEffectsProps) {
  const role = pageRole ?? (pageIndex === 0 ? "front_cover" : "body");
  const isFrontCover = role === "front_cover";
  const isBackCoverCard = role === "back_cover_card";
  const isPvcCover = role === "pvc_cover";
  const isCoverPage = isFrontCover || isBackCoverCard || isPvcCover;

  // Paper background color
  const paperBg = PAPER_COLORS[effects.paperColor] ?? "#ffffff";

  // Back cover card: solid color, edge-to-edge — use card color as wrapper bg too
  const backCoverColor = isBackCoverCard ? (BACK_COVER_COLORS[effects.backCover] ?? "#1a1a1a") : undefined;
  const wrapperBg = isBackCoverCard ? backCoverColor! : isPvcCover ? "transparent" : paperBg;

  // Bleed: show white border based on scope — card covers & PVC are always edge-to-edge
  const isBleedForThisPage =
    effects.bleed === "all" ||
    (effects.bleed === "front_cover" && isFrontCover) ||
    (effects.bleed === "covers" && isCoverPage);
  const showBleedMargin = !isBleedForThisPage && !isBackCoverCard && !isPvcCover;

  // PVC overlay type — applied on pvc_cover pages
  const pvcOverlayType = isPvcCover ? effects.frontCover : null;

  // Front cover overlay — no longer applied on front_cover (moved to pvc_cover)
  const frontCoverOverlay = null;

  // Lamination sheen on covers (not PVC)
  const showLamination = (isFrontCover || isBackCoverCard) && effects.coverLamination !== "none";

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: wrapperBg }}>
      {/* Back cover card: solid color replacement */}
      {isBackCoverCard ? (
        <div className="w-full h-full" style={{ backgroundColor: backCoverColor }} />
      ) : isPvcCover ? (
        /* PVC cover: show content underneath with transparent overlay */
        <div className="w-full h-full relative">
          {children}
          {/* PVC overlay effect */}
          {pvcOverlayType === "clear_pvc" && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "rgba(255,255,255,0.12)",
                boxShadow: "inset 0 0 20px rgba(255,255,255,0.1)",
              }}
            />
          )}
          {pvcOverlayType === "frosted_pvc" && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "rgba(255,255,255,0.35)",
                backdropFilter: "blur(1.5px)",
                WebkitBackdropFilter: "blur(1.5px)",
              }}
            />
          )}
          {pvcOverlayType === "matte_pvc" && (
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
      ) : (
        <>
          {/* Content with optional bleed margin */}
          <div
            className="w-full h-full"
            style={showBleedMargin ? { padding: "3%", boxSizing: "border-box" } : undefined}
          >
            {children}
          </div>
        </>
      )}

      {/* PVC front cover overlay */}
      {frontCoverOverlay === "clear_pvc" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "rgba(255,255,255,0.12)",
            boxShadow: "inset 0 0 20px rgba(255,255,255,0.1)",
          }}
        />
      )}
      {frontCoverOverlay === "frosted_pvc" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "rgba(255,255,255,0.35)",
            backdropFilter: "blur(1.5px)",
            WebkitBackdropFilter: "blur(1.5px)",
          }}
        />
      )}
      {frontCoverOverlay === "matte_pvc" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "rgba(255,255,255,0.25)",
            backdropFilter: "blur(0.5px)",
            WebkitBackdropFilter: "blur(0.5px)",
          }}
        />
      )}

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
  // Position holes evenly along the left edge
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
