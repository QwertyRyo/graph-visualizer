// color helpers with no assets or browser needs, so tests can import them

// wcag relative luminance of an [r, g, b] color
function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// the fill itself, darkened in the same hue until it shows on white
export function ringColor(fill: string): string {
  let rgb = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
  if (rgb.some(Number.isNaN)) return "#2563eb";
  for (let i = 0; i < 40 && luminance(rgb) > 0.3; i++) rgb = rgb.map((c) => c * 0.92);
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

// dark text on light fills, white text on dark fills
export function labelColor(fill: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
  const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return brightness > 0.55 ? "#0f172a" : "#ffffff";
}
