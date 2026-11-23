type Section = { section_type?: string | null; is_color?: boolean | null };
type Snapshot = { sections?: Section[] | null; spec?: { is_color?: boolean | null; selected_options?: Record<string, string> } | null };

const MONO = /black\s*(&|and)?\s*white|\bb\s*&\s*w\b|\bmono|grey|gray/i;

/** True when the saved product's cover prints in black & white, so its colour thumbnail must be shown monochrome. */
export function bookshelfCoverIsMono(snapshot: Snapshot): boolean {
  const sections = snapshot.sections ?? [];
  const cover = sections.find(s => s.section_type === "front_cover") ?? sections[0];
  if (cover && typeof cover.is_color === "boolean") return !cover.is_color;
  const option = Object.entries(snapshot.spec?.selected_options ?? {}).find(([key]) => /colou?r/i.test(key))?.[1];
  if (option) return MONO.test(option);
  return snapshot.spec?.is_color === false;
}
