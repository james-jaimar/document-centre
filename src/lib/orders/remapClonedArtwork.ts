export interface ClonedArtworkDocument {
  originalId: string;
  originalPath: string | null;
  clonedId: string;
  clonedPath: string | null;
}

/** Only rewrite artwork references in an editable spec, never a placed-order snapshot. */
export function remapClonedArtwork<T>(spec: T, documents: ClonedArtworkDocument[]): T {
  const byPath = new Map(documents.filter((doc) => doc.originalPath).map((doc) => [doc.originalPath, doc]));
  const byId = new Map(documents.map((doc) => [doc.originalId, doc]));

  const remap = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(remap);
    if (!value || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    const clone = (typeof record.storage_path === "string" ? byPath.get(record.storage_path) : undefined)
      ?? (typeof record.original_storage_path === "string" ? byPath.get(record.original_storage_path) : undefined)
      ?? (typeof record.document_id === "string" ? byId.get(record.document_id) : undefined);
    const updated = Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, remap(entry)]));
    if (clone) {
      if ("storage_path" in record) updated.storage_path = clone.clonedPath;
      if ("original_storage_path" in record) updated.original_storage_path = clone.clonedPath;
      if ("document_id" in record) updated.document_id = clone.clonedId;
    }
    return updated;
  };

  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return spec;
  const result = { ...spec } as Record<string, unknown>;
  for (const key of ["uploaded_artwork", "templated_artwork", "photo_prints", "canvas_prints"]) {
    if (key in result) result[key] = remap(result[key]);
  }
  return result as T;
}