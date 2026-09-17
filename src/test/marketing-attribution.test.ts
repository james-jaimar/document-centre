import { beforeEach, describe, expect, it } from "vitest";
import {
  campaignAnalyticsFields,
  captureCampaignAttribution,
  readCampaignAttribution,
} from "@/lib/marketingAttribution";

describe("campaign attribution", () => {
  beforeEach(() => sessionStorage.clear());

  it("stores only approved UTM fields", () => {
    const value = captureCampaignAttribution("?utm_source=email&utm_campaign=email_02&token=secret");
    expect(value).toEqual({ utm_source: "email", utm_campaign: "email_02" });
    expect(JSON.stringify(readCampaignAttribution())).not.toContain("secret");
  });

  it("keeps the attribution across navigation without query parameters", () => {
    captureCampaignAttribution("?utm_medium=email&utm_content=deskpad");
    expect(captureCampaignAttribution("")).toEqual({ utm_medium: "email", utm_content: "deskpad" });
  });

  it("returns analytics-safe fields", () => {
    expect(campaignAnalyticsFields({ utm_source: "email", utm_campaign: "email_02" }))
      .toEqual({ utm_source: "email", utm_campaign: "email_02" });
  });
});