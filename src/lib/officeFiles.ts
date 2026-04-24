/**
 * Detection + MIME mapping for Office documents that the print pipeline
 * accepts. Browsers are inconsistent about reporting MIME types for
 * OpenDocument files (often `application/octet-stream`), so we always
 * fall back to extension matching and we re-derive a real MIME from the
 * filename before sending to the converter.
 */

export const OFFICE_EXTENSIONS = [
  "doc",
  "docx",
  "ppt",
  "pptx",
  "odt",
  "odp",
  "ods",
] as const;

export type OfficeExtension = (typeof OFFICE_EXTENSIONS)[number];

const EXT_TO_MIME: Record<OfficeExtension, string> = {
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
};

/** Set of every Office MIME type we recognise. */
export const OFFICE_MIME_TYPES: Set<string> = new Set(Object.values(EXT_TO_MIME));

/** Comma-separated `accept` attribute for `<input type="file">`. */
export const OFFICE_ACCEPT_STRING: string = [
  ...OFFICE_MIME_TYPES,
  ...OFFICE_EXTENSIONS.map((e) => `.${e}`),
].join(",");

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i === -1) return "";
  return name.slice(i + 1).toLowerCase();
}

export function isOfficeFile(file: File | { name: string; type?: string }): boolean {
  if (file.type && OFFICE_MIME_TYPES.has(file.type)) return true;
  return (OFFICE_EXTENSIONS as readonly string[]).includes(extOf(file.name));
}

/**
 * Resolve a real Office MIME type from a filename, regardless of what the
 * browser reported. Returns `application/octet-stream` for non-Office files.
 */
export function officeMimeFromFilename(name: string): string {
  const ext = extOf(name) as OfficeExtension;
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}
