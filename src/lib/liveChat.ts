/**
 * Tawk.to live chat helpers.
 *
 * A Tawk embed URL is `https://embed.tawk.to/<propertyId>/<widgetId>` — BOTH
 * segments are required. Historically we stored a single free-text field and
 * most tenants pasted only the property ID, so the script 404'd silently and
 * no widget ever appeared. We now store the two parts separately and validate
 * them before injecting anything.
 */

export const TAWK_EMBED_BASE = "https://embed.tawk.to";

/** Platform-owned widget, used for demo tenants only. */
export const PLATFORM_TAWK_PROPERTY_ID = "69f09c163aaa4c1c3adc10c6";
export const PLATFORM_TAWK_WIDGET_ID = "1jn9u3enj";

export interface LiveChatIds {
  propertyId: string;
  widgetId: string;
}

/** Strip JSON quoting/whitespace off a settings value. */
export function unwrapSetting(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = String(value).replace(/^"|"$/g, "").trim();
  return raw.toLowerCase() === "null" ? "" : raw;
}

/** Tawk property IDs are 24 hex chars; widget IDs are short alphanumerics. */
export function isValidPropertyId(id: string): boolean {
  return /^[a-f0-9]{20,32}$/i.test(id.trim());
}

export function isValidWidgetId(id: string): boolean {
  return /^[a-z0-9]{4,24}$/i.test(id.trim());
}

export function isValidChatIds(ids: LiveChatIds): boolean {
  return isValidPropertyId(ids.propertyId) && isValidWidgetId(ids.widgetId);
}

/**
 * Accept anything the user pastes — a full Direct Chat Link, an embed URL,
 * `property/widget`, or a bare property ID — and split it into its parts.
 */
export function parseChatPaste(input: string): Partial<LiveChatIds> {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(embed|tawk)\.to\//i, "")
    .replace(/^embed\.tawk\.to\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/^\/+|\/+$/g, "");
  if (!cleaned) return {};
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return { propertyId: parts[parts.length - 2], widgetId: parts[parts.length - 1] };
  }
  return { propertyId: parts[0] };
}

/** Build the embed src, or null when the pair is incomplete/malformed. */
export function chatEmbedSrc(ids: Partial<LiveChatIds> | null | undefined): string | null {
  const propertyId = (ids?.propertyId ?? "").trim();
  const widgetId = (ids?.widgetId ?? "").trim();
  if (!isValidChatIds({ propertyId, widgetId })) return null;
  return `${TAWK_EMBED_BASE}/${propertyId}/${widgetId}`;
}
