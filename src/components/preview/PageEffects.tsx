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

/** Roles that represent non-paper material (no bleed margin, no paper tint) */
const MATERIAL_ROLES = new Set([
  "pvc_cover_front",
  "pvc_cover_back",
  "inside_back_cover_card",
  "back_cover_card",
]);

/** Roles that are intentional blank paper pages */
const BLANK_PAPER_ROLES = new Set([
  "blank_back",
  "inside_back_blank",
]);

interface PageEffectsProps {
  effects: PreviewEffects;
  pageIndex: number;
  totalPages: number;
  children: React.ReactNode;
  /** Explicit page role */
  pageRole?: string;
}

/**
 * Wraps a page's content and applies visual finishing effects.
 * Each role renders one specific physical face.
 */
export default function PageEffects({ effects, pageIndex, totalPages, children, pageRole }: PageEffectsProps) {
  const role = pageRole ?? (pageIndex === 0 ? "front_cover" : "body");
  const isMaterial = MATERIAL_ROLES.has(role);

  // ── PVC cover front: artwork + PVC overlay ──
  if (role === "pvc_cover_front") {
    return (
      <div className="relative w-full h-full" style={{ backgroundColor: "transparent" }}>
        <div className="w-full h-full relative">
          {children}
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
      </div>
    );
  }

  // ── PVC cover back: translucent reverse side of the plastic sheet ──
  if (role === "pvc_cover_back") {
    return (
      <div className="relative w-full h-full" style={{ backgroundColor: "rgba(240,240,240,0.6)" }}>
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

  // ── Inside back cover card: solid colour, edge-to-edge ──
  if (role === "inside_back_cover_card") {
    const cardColor = BACK_COVER_COLORS[effects.backCover] ?? "#1a1a1a";
    return (
      <div className="relative w-full h-full" style={{ backgroundColor: cardColor }} />
    );
  }

  // ── Back cover card: solid colour, edge-to-edge ──
  if (role === "back_cover_card") {
    const cardColor = BACK_COVER_COLORS[effects.backCover] ?? "#1a1a1a";
    return (
      <div className="relative w-full h-full" style={{ backgroundColor: cardColor }} />
    );
  }

  // ── Standard pages (front_cover, body, blank, etc.) ──
  const isFrontCover = role === "front_cover";
  const isCoverPage = isFrontCover;

  const paperBg = PAPER_COLORS[effects.paperColor] ?? "#ffffff";

  // Bleed: show white border based on scope
  const isBleedForThisPage =
    effects.bleed === "all" ||
    (effects.bleed === "front_cover" && isFrontCover) ||
    (effects.bleed === "covers" && isCoverPage);
  const showBleedMargin = !isBleedForThisPage;

  // Lamination sheen on front cover only (not PVC — that's a separate material)
  const showLamination = isFrontCover && effects.coverLamination !== "none";

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: paperBg }}>
      <div
        className="w-full h-full"
        style={showBleedMargin ? { padding: "3%", boxSizing: "border-box" } : undefined}
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
