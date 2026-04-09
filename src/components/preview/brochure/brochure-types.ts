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

/** Fold direction at a hinge between two panels */
export type FoldDirection = "inward" | "outward";

/** A hinge connecting two adjacent panels */
export interface Hinge {
  id: string;
  leftPanelId: string;
  rightPanelId: string;
  direction: FoldDirection;
}

/** Which surface of the physical sheet we are looking at */
export type Surface = "outside" | "inside";

/** Named view state — rotation angles (degrees) per panel id */
export interface FoldState {
  label: string;
  rotations: Record<string, number>;
  /** Which surface this state naturally shows (for labelling) */
  surface?: Surface;
  /** When true the whole scene is rotated 180° so the viewer sees the back */
  flipScene?: boolean;
}

/** Complete specification for rendering a folded brochure */
export interface BrochureSpec {
  panels: Panel[];
  hinges: Hinge[];
  /** All discrete fold states for the outside surface */
  outsideStates: FoldState[];
  /** All discrete fold states for the inside surface */
  insideStates: FoldState[];
  /** Index into panels[] that serves as the fixed root for the fold tree */
  rootPanelIndex: number;
}
