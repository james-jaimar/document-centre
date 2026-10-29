import type { ConfigSection } from "./types";

/** Display-only fallback for historical snapshots; never reprice saved orders. */
export function withRawProductionOptions(sections: ConfigSection[] = [], rawSpec: any = {}): ConfigSection[] {
  const result = sections.map(section => ({ ...section, items: [...section.items] }));
  const existing = new Set(result.flatMap(section => section.items.map(item => item.label.toLowerCase())));
  for (const [label, raw] of Object.entries(rawSpec?.selected_options || {})) {
    if (existing.has(label.toLowerCase()) || !raw) continue;
    const values = (Array.isArray(raw) ? raw : [raw]).filter(value => typeof value === "string");
    if (!values.length) continue;
    const title = /finish|laminat|corner|padd/i.test(label) ? "Finishing" : "Selected options";
    let section = result.find(section => section.title === title);
    if (!section) {
      section = { title, items: [] };
      result.push(section);
    }
    section.items.push({ label, value: values.join(", ") });
    existing.add(label.toLowerCase());
  }
  return result;
}