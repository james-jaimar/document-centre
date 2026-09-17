export const CAMPAIGN_ATTRIBUTION_KEY = "dc_campaign_attribution";

const ALLOWED_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
type AttributionKey = (typeof ALLOWED_KEYS)[number];
export type CampaignAttribution = Partial<Record<AttributionKey, string>>;

function clean(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
}

export function captureCampaignAttribution(search: string): CampaignAttribution | null {
  const params = new URLSearchParams(search);
  const attribution: CampaignAttribution = {};
  for (const key of ALLOWED_KEYS) {
    const value = clean(params.get(key));
    if (value) attribution[key] = value;
  }
  if (!Object.keys(attribution).length) return readCampaignAttribution();
  try {
    sessionStorage.setItem(CAMPAIGN_ATTRIBUTION_KEY, JSON.stringify(attribution));
  } catch {
    // Attribution is best-effort and must never interrupt storefront browsing.
  }
  return attribution;
}

export function readCampaignAttribution(): CampaignAttribution | null {
  try {
    const raw = sessionStorage.getItem(CAMPAIGN_ATTRIBUTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const attribution: CampaignAttribution = {};
    for (const key of ALLOWED_KEYS) {
      if (typeof parsed[key] === "string") attribution[key] = clean(parsed[key] as string);
    }
    return Object.keys(attribution).length ? attribution : null;
  } catch {
    return null;
  }
}

export function campaignAnalyticsFields(attribution: CampaignAttribution | null): Record<string, string> {
  if (!attribution) return {};
  return Object.fromEntries(
    ALLOWED_KEYS.flatMap((key) => attribution[key] ? [[key, attribution[key] as string]] : []),
  );
}