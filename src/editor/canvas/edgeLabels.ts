import type { Core, EdgeSingular } from "cytoscape";
import { EDGE_LABEL_FONT, EDGE_LABEL_PADDING, measureText } from "./cyStyle";
import { edgePath, placeLabels, type Box, type LabelRequest } from "./labelPlacement";

const GAP = 2;
const TEMP_NODES = ".eh-ghost, .ep-temp";
const TEMP_EDGES = ".eh-preview, .eh-ghost-edge, .ep-temp";

export function enableEdgeLabelPlacement(
  cy: Core,
  isWeighted: () => boolean,
): { refresh: () => void; stop: () => void } {
  const widths = new Map<string, number>();
  let frame = 0;
  let writing = false;

  function labelWidth(text: string): number {
    let w = widths.get(text);
    if (w === undefined) {
      w = measureText(text, EDGE_LABEL_FONT) ?? text.length * EDGE_LABEL_FONT * 0.6;
      widths.set(text, w);
    }
    return w;
  }

  function place() {
    frame = 0;
    if (!isWeighted()) return;

    const obstacles: Box[] = [];
    cy.nodes()
      .not(TEMP_NODES)
      .forEach((n) => {
        const b = n.boundingBox({ includeLabels: false, includeOverlays: false });
        obstacles.push({ x1: b.x1 - GAP, y1: b.y1 - GAP, x2: b.x2 + GAP, y2: b.y2 + GAP });
      });

    const edges = cy.edges("[weight]").filter((e) => !e.is(TEMP_EDGES));
    const requests: LabelRequest[] = edges.map((e: EdgeSingular) => ({
      id: e.id(),
      mid: e.midpoint(),
      path: edgePath(e.sourceEndpoint(), e.targetEndpoint(), e.controlPoints() ?? []),
      width: labelWidth(String(e.data("weight"))) + 2 * (EDGE_LABEL_PADDING + GAP),
      height: EDGE_LABEL_FONT + 2 * (EDGE_LABEL_PADDING + GAP),
    }));
    const offsets = placeLabels(requests, obstacles);

    writing = true;
    cy.batch(() => {
      edges.forEach((e) => {
        const o = offsets.get(e.id());
        if (!o) return;
        const dx = Math.round(o.x);
        const dy = Math.round(o.y);
        if (e.data("labelDx") !== dx || e.data("labelDy") !== dy) e.data({ labelDx: dx, labelDy: dy });
      });
    });
    writing = false;
  }

  const refresh = () => {
    if (!writing && !frame) frame = requestAnimationFrame(place);
  };

  const events = "add remove position data";
  cy.on(events, refresh);
  refresh();

  return {
    refresh,
    stop: () => {
      cancelAnimationFrame(frame);
      cy.off(events, refresh);
    },
  };
}
