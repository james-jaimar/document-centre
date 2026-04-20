/**
 * Resolve a person's display name with consistent fallback priority:
 * first_name + last_name → display_name → email local-part → fallback.
 *
 * Use this everywhere we render a profile/user/customer name so that real
 * names always win over auto-seeded values.
 */
export function resolveDisplayName(
  p: {
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
    email?: string | null;
  } | null | undefined,
  fallback = "User",
): string {
  if (!p) return fallback;
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (p.display_name && p.display_name.trim()) return p.display_name.trim();
  if (p.email) return p.email.split("@")[0];
  return fallback;
}

/** Two-letter initials derived from the resolved display name. */
export function resolveInitials(
  p: Parameters<typeof resolveDisplayName>[0],
  fallback = "U",
): string {
  const name = resolveDisplayName(p, fallback);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
