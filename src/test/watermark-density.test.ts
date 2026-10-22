import { describe, expect, it } from "vitest";
import {
  normaliseWatermarkValue,
  setOriginalWatermarkDensity,
  type TemplatedImageValue,
} from "@/lib/artworkTemplates/types";

const image: TemplatedImageValue = {
  placeholder_id: "watermark",
  kind: "image",
  storage_path: "artwork/watermark.png",
  file_name: "watermark.png",
  mime_type: "image/png",
  source_width_px: 1000,
  source_height_px: 1000,
  fit: "fit",
  scale: 1,
  offset_x: 0,
  offset_y: 0,
};
const watermark = { is_watermark: true };

describe("watermark density", () => {
  it("defaults to 10% without an original-density opt-in", () => {
    expect(normaliseWatermarkValue(watermark, image).opacity).toBe(0.1);
  });

  it("caps previously saved ordinary watermarks at 10%", () => {
    expect(normaliseWatermarkValue(watermark, { ...image, opacity: 0.2 }).opacity).toBe(0.1);
  });

  it("retains the ordinary 5% choice", () => {
    expect(normaliseWatermarkValue(watermark, { ...image, opacity: 0.05 }).opacity).toBe(0.05);
  });

  it("sets original-density artwork to 100% and preserves the opt-in after saving and reloading", () => {
    const chosen = setOriginalWatermarkDensity(image, true);
    const saved = JSON.parse(JSON.stringify(chosen)) as TemplatedImageValue;
    expect(normaliseWatermarkValue(watermark, saved)).toMatchObject({
      preserve_original_density: true,
      opacity: 1,
    });
  });

  it("restores 10% when original density is turned off", () => {
    const chosen = setOriginalWatermarkDensity(image, true);
    expect(normaliseWatermarkValue(watermark, setOriginalWatermarkDensity(chosen, false))).toMatchObject({
      preserve_original_density: false,
      opacity: 0.1,
    });
  });

  it("does not change normal image opacity", () => {
    const normalImage = { ...image, opacity: 0.8 };
    expect(normaliseWatermarkValue({ is_watermark: false }, normalImage)).toEqual(normalImage);
  });

  it("does not change normal text opacity", () => {
    expect(normaliseWatermarkValue({ is_watermark: false }, {
      placeholder_id: "text", kind: "text", value: "Name", opacity: 0.8,
    }).opacity).toBe(0.8);
  });
});