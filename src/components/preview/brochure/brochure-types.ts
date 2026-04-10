/** Face content for one side of one panel */
export interface PanelFaceContent {
  imageUrl?: string;
  backgroundColor?: string;
  label?: string;
}

/** A single physical panel of a folded sheet */
export interface Panel {
  id: string;
  /** Normalised width fraction (0-1, all panels sum to 1) */
  widthFraction: number;
  front: PanelFaceContent;
  back: PanelFaceContent;
}

/** Which surface of the physical sheet we are looking at */
export type Surface = "outside" | "inside";

/** Per-panel fold configuration */
export interface PanelFoldConfig {
  panelId: string;
  /** Which edge this panel hinges on */
  hingeEdge: "left" | "right";
  /** Rotation angle (degrees) when folded on the outside surface */
  outsideFoldedAngle: number;
  /** Rotation angle (degrees) when folded on the inside surface */
  insideFoldedAngle: number;
  /** Label for the fold toggle button */
  label: string;
}

/** Complete specification for rendering a folded brochure */
export interface BrochureSpec {
  panels: Panel[];
  /** Which panels can fold and their fold config. Root/fixed panels are excluded. */
  foldConfigs: PanelFoldConfig[];
  /** Index into panels[] that serves as the fixed root for the fold tree */
  rootPanelIndex: number;
}
