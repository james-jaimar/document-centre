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

/** White tab card colour (off-white card stock) */
const WHITE_TAB_COLOR = "#f5f5f5";

/** Solid PVC tab body palette — must match TAB_COLORS / FlipBook resolveTabColor */
const TAB_BODY_COLORS: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  pink: "#ec4899",
  purple: "#8b5cf6",
  black: "#1f2937",
  navy: "#1e3a5f",
  gray: "#9ca3af",
  grey: "#9ca3af",
  pastel_blue: "#93c5fd",
  pastel_green: "#86efac",
  pastel_yellow: "#fde68a",
  pastel_pink: "#fbcfe8",
};

/** Resolve a tab body colour from a slug or hex value. Empty/white → off-white card. */
function resolveTabBodyColor(value: string | undefined): string {
  if (!value || value === "white" || value === "") return WHITE_TAB_COLOR;
  // Already a hex value (passed through from cycled multicolor)
  if (value.startsWith("#")) return value;
  return TAB_BODY_COLORS[value] ?? WHITE_TAB_COLOR;
}

/** Lightish colours where dark text reads better than white */
const LIGHT_TAB_BACKGROUNDS = new Set([
  WHITE_TAB_COLOR,
  "#eab308", // yellow
  "#fde68a", // pastel yellow
  "#fbcfe8", // pastel pink
  "#93c5fd", // pastel blue
  "#86efac", // pastel green
]);

/** Roles that are blank paper faces */
const BLANK_PAPER_ROLES = new Set(["blank_back", "inside_back_blank"]);

/** Back-facing roles where hole punches should appear on the right */
const BACK_FACE_ROLES = new Set([
  "blank_back", "tab_back", "insert_back", "inside_back_blank",
  "inside_back_cover_card", "pvc_cover_back",
]);

/** Insert sheet colors */
const INSERT_COLORS: Record<string, string> = {
  white: "#f8f8f8",
  yellow: "#fef9c3",
  blue: "#dbeafe",
  green: "#dcfce7",
  pink: "#fce7f3",
};

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
  /** Optional label for tab/insert pages */
  label?: string;
  /** Optional color slug for insert pages */
  color?: string;
}

/**
 * Single source of truth for all page visual treatment.
 *
 * Every page slot renders through ONE of these branches:
 * 1. Card material — solid color, edge-to-edge, no children
 * 2. PVC cover back — translucent reverse face, no children
 * 3. PVC cover front — children (artwork) + PVC overlay
 * 4. Blank paper — paper color + shadow, no children
 * 5. Standard paper — paper color + shadow + absolute-positioned content frame + children
 *
 * IMPORTANT: Content positioning uses absolute inset (not padding) so that
 * react-pageflip's canvas measurement is never affected by box-model changes.
 */
export default function PageEffects({ effects, pageIndex, totalPages, children, pageRole, allowBleed, bleedInsetPx, label, color }: PageEffectsProps) {
  const role = pageRole ?? (pageIndex === 0 ? "front_cover" : "body");
  const holeSide: "left" | "right" = BACK_FACE_ROLES.has(role) ? "right" : "left";

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
    );
  }

  // ── Tab divider front: solid PVC sheet (or off-white card for white) with label ──
  if (role === "tab") {
    const tabBg = resolveTabBodyColor(color);
    const isLight = LIGHT_TAB_BACKGROUNDS.has(tabBg);
    const labelColor = isLight ? "#374151" : "#ffffff";
    const labelOpacity = isLight ? 0.35 : 0.55;
    return (
      <div className="w-full h-full" style={{ backgroundColor: tabBg, boxShadow: PAPER_SHADOW }}>
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center" style={{ opacity: labelOpacity }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: labelColor, letterSpacing: 0.5 }}>{label || "TAB"}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Tab divider back: solid PVC sheet (same colour as front face) ──
  if (role === "tab_back") {
    const tabBg = resolveTabBodyColor(color);
    return (
      <div className="w-full h-full" style={{ backgroundColor: tabBg, boxShadow: PAPER_SHADOW }} />
    );
  }

  // ── 4a. Insert sheet back: plain paper same color ──
  if (role === "insert_back") {
    const insertBg = INSERT_COLORS[color || "white"] ?? INSERT_COLORS.white;
    return (
      <div className="w-full h-full" style={{ backgroundColor: insertBg, boxShadow: PAPER_SHADOW }} />
    );
  }

  // ── 4b. Insert sheet front: solid colored divider ──
  if (role === "insert") {
    const insertBg = INSERT_COLORS[color || "white"] ?? INSERT_COLORS.white;
    return (
      <div className="w-full h-full" style={{ backgroundColor: insertBg, boxShadow: PAPER_SHADOW }}>
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-center opacity-20">
            <p style={{ fontSize: 10, fontWeight: 600, color: "#666" }}>{label || "INSERT"}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── 5. Blank paper: paper color + shadow, no content ──
  if (BLANK_PAPER_ROLES.has(role)) {
    const paperBg = PAPER_COLORS[effects.paperColor] ?? "#ffffff";
    return (
      <div className="w-full h-full" style={{ backgroundColor: paperBg, boxShadow: PAPER_SHADOW }}>
        {effects.holePunch > 0 && <HolePunchMarks count={effects.holePunch as 2 | 4} side={holeSide} />}
      </div>
    );
  }

  // ── 5. Standard paper page (front_cover, body, etc.) ──
  const paperBg = PAPER_COLORS[effects.paperColor] ?? "#ffffff";

  // Content inset: absolute positioning instead of padding.
  // This ensures react-pageflip's measurement container (the outer div)
  // is always exactly pageWidth × pageHeight with no box-model interference.
  const inset = allowBleed ? 0 : bleedInsetPx;

  // Lamination sheen on front cover only (not PVC — that's a separate material)
  const showLamination = role === "front_cover" && effects.coverLamination !== "none";

  return (
    <div className="w-full h-full relative" style={{ backgroundColor: paperBg, boxShadow: PAPER_SHADOW }}>
      {/* Absolutely positioned content frame — never affects outer dimensions */}
      <div
        className="absolute overflow-hidden"
        style={{
          top: inset,
          left: inset,
          right: inset,
          bottom: inset,
        }}
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
      {effects.holePunch > 0 && <HolePunchMarks count={effects.holePunch as 2 | 4} side={holeSide} />}
    </div>
  );
}

function HolePunchMarks({ count, side = "left" }: { count: 2 | 4; side?: "left" | "right" }) {
  const positions = count === 2 ? [33, 67] : [20, 40, 60, 80];
  return (
    <>
      {positions.map((pct) => (
        <div
          key={pct}
          className="absolute pointer-events-none"
          style={{
            ...(side === "left" ? { left: "3%" } : { right: "3%" }),
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
