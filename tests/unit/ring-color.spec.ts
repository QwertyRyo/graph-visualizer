import { expect, test } from "@playwright/test";
import { ringColor } from "../../src/editor/canvas/colors";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// wcag relative luminance, written out here so the test checks the rule itself
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrastOnWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

const PALETTE = [
  "#a78bfa", "#94a3b8", "#f87171", "#fb923c", "#facc15",
  "#4ade80", "#2dd4bf", "#60a5fa", "#f472b6", "#e0e7ff",
  "#000000", "#ffffff",
];

test.describe("ringColor", () => {
  test("always returns a #rrggbb color that shows on white", () => {
    for (const fill of PALETTE) {
      const ring = ringColor(fill);
      expect(ring, fill).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrastOnWhite(ring), `${fill} -> ${ring}`).toBeGreaterThanOrEqual(3);
    }
  });

  test("darkens pale colors and never lightens", () => {
    for (const fill of PALETTE) {
      expect(luminance(ringColor(fill)), fill).toBeLessThanOrEqual(luminance(fill) + 1e-9);
    }
    expect(luminance(ringColor("#facc15"))).toBeLessThan(luminance("#facc15") * 0.6);
  });

  test("leaves colors that already show on white alone", () => {
    for (const fill of ["#000000", "#1e3a8a", "#7f1d1d", "#14532d"]) {
      expect(ringColor(fill), fill).toBe(fill);
    }
  });

  test("keeps the hue", () => {
    // each channel scales by the same factor, so the largest channel stays largest
    const [r, g, b] = rgb(ringColor("#4ade80"));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    const [r2, g2, b2] = rgb(ringColor("#f87171"));
    expect(r2).toBeGreaterThan(g2);
    expect(r2).toBeGreaterThan(b2);
    const ratio = rgb("#4ade80")[0] / rgb("#4ade80")[1];
    expect(r / g).toBeCloseTo(ratio, 1);
  });

  test("falls back to blue for input that is not a color", () => {
    for (const bad of ["", "red", "#xyz", "#12"]) {
      expect(ringColor(bad), bad).toBe("#2563eb");
    }
  });

  test("is stable, so repeated calls agree", () => {
    expect(ringColor("#e0e7ff")).toBe(ringColor("#e0e7ff"));
  });
});
