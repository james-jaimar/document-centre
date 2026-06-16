import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Humanise a slug for customer-facing fallback display when a structured
 * option value can't be resolved to its label. "a4-landscape" → "A4 Landscape",
 * "no-inserts" → "No Inserts". Short alpha-numeric tokens (A4, DL, SRA3, US)
 * are upper-cased so paper-size codes look right.
 */
export function humaniseSlug(slug: string | undefined | null): string {
  if (!slug) return "";
  return String(slug)
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => {
      if (/^[a-z]{1,4}\d*$/i.test(w) && w.length <= 4) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}
