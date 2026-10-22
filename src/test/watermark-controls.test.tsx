import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import PlaceholderPanel from "@/components/artwork/PlaceholderPanel";
import {
  normaliseWatermarkValue,
  type ArtworkPlaceholder,
  type TemplatedPlaceholderValue,
} from "@/lib/artworkTemplates/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("applies 100% through the checkbox, keeps it after reload, and returns to 10% when unchecked", () => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  const placeholder = {
    id: "watermark", name: "Watermark", kind: "image", is_watermark: true,
    width_mm: 100, height_mm: 100,
  } as ArtworkPlaceholder;
  let saved: TemplatedPlaceholderValue = {
    placeholder_id: "watermark", kind: "image", storage_path: "artwork/watermark.png",
    file_name: "watermark.png", mime_type: "image/png", source_width_px: 1000,
    source_height_px: 1000, fit: "fit", scale: 1, offset_x: 0, offset_y: 0, opacity: 0.1,
  };
  function Editor() {
    const [value, setValue] = useState(() => normaliseWatermarkValue(placeholder, saved));
    return <PlaceholderPanel placeholder={placeholder} value={value}
      onFocus={() => {}} onPickFile={() => {}} onClear={() => {}}
      onChange={(next) => {
        saved = JSON.parse(JSON.stringify(normaliseWatermarkValue(placeholder, next)));
        setValue(saved);
      }} />;
  }
  const first = render(<Editor />);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(saved).toMatchObject({ preserve_original_density: true, opacity: 1 });
  first.unmount();
  render(<Editor />);
  expect(screen.getByRole("checkbox")).toBeChecked();
  expect(saved.opacity).toBe(1);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(saved).toMatchObject({ preserve_original_density: false, opacity: 0.1 });
  fireEvent.click(screen.getByRole("button", { name: "5%" }));
  expect(saved.opacity).toBe(0.05);
});