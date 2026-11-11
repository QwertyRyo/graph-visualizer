import type { Core, LayoutOptions } from "cytoscape";
import { useEditorStore } from "../store";

export const LAYOUTS = ["circle", "grid", "cose"] as const;
export type LayoutName = (typeof LAYOUTS)[number];

const PADDING = 40;
const DURATION = 400;

// the part of the canvas no floating panel covers, in canvas pixels
function openArea(cy: Core) {
  const box = cy.container()!.getBoundingClientRect();
  const inset = { left: 0, top: 0, right: 0, bottom: 0 };
  const edge = (side: keyof typeof inset, measure: (r: DOMRect) => number) => {
    const el = document.querySelector(`[data-floating="${side}"]`);
    const r = el?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) inset[side] = Math.max(0, measure(r));
  };
  edge("left", (r) => r.right - box.left);
  edge("top", (r) => r.bottom - box.top);
  edge("right", (r) => box.right - r.left);
  edge("bottom", (r) => box.bottom - r.top);
  return {
    x: inset.left,
    y: inset.top,
    w: box.width - inset.left - inset.right,
    h: box.height - inset.top - inset.bottom,
  };
}

// like cy.fit, but centres the graph in the space the panels leave
export function fitVisible(cy: Core, animate = true) {
  const els = cy.elements().not(".eh-ghost, .eh-preview, .ep-temp");
  if (els.empty()) return;
  const bb = els.boundingBox();
  const area = openArea(cy);
  const w = Math.max(area.w - 2 * PADDING, 1);
  const h = Math.max(area.h - 2 * PADDING, 1);
  const raw = Math.min(w / Math.max(bb.w, 1), h / Math.max(bb.h, 1));
  const zoom = Math.min(Math.max(raw, cy.minZoom()), cy.maxZoom());
  const pan = {
    x: area.x + area.w / 2 - zoom * (bb.x1 + bb.w / 2),
    y: area.y + area.h / 2 - zoom * (bb.y1 + bb.h / 2),
  };
  if (animate) cy.animate({ zoom, pan, duration: DURATION });
  else cy.viewport({ zoom, pan });
}

// runs a layout, then saves all positions as one undo step
export function runLayout(cy: Core, name: LayoutName, animate = true) {
  if (cy.nodes().empty()) return;
  const layout = cy.layout({ name, animate, animationDuration: DURATION, fit: false, padding: PADDING } as LayoutOptions);
  layout.one("layoutstop", () => {
    fitVisible(cy, animate);
    const { doc, replaceDoc } = useEditorStore.getState();
    const nodes = doc.nodes.map((n) => {
      const el = cy.getElementById(n.id);
      if (el.empty()) return n;
      const { x, y } = el.position();
      return { ...n, x, y };
    });
    replaceDoc({ ...doc, nodes });
  });
  layout.run();
}
