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

/** Named view state — rotation angles (degrees) per panel id */
export interface FoldState {
  label: string;
  rotations: Record<string, number>;
}

/** Complete specification for rendering a folded brochure */
export interface BrochureSpec {
  panels: Panel[];
  hinges: Hinge[];
  states: FoldState[];
}
