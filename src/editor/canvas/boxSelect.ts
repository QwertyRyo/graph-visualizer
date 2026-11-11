import type { Core, EdgeSingular, EventObject, NodeSingular, Position } from "cytoscape";
import { ACCENT } from "../theme";

const MIN_SIZE = 4;
const CURVE_STEPS = 16;

type Rect = { x1: number; y1: number; x2: number; y2: number };

// liang-barsky: does segment a-b cross the rectangle
function segmentTouches(a: Position, b: Position, r: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const sides: [number, number][] = [
    [-dx, a.x - r.x1],
    [dx, r.x2 - a.x],
    [-dy, a.y - r.y1],
    [dy, r.y2 - a.y],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

// parallel directed edges bend, so follow the curve
function edgeTouches(edge: EdgeSingular, r: Rect): boolean {
  const s = edge.renderedSourceEndpoint();
  const t = edge.renderedTargetEndpoint();
  const cp = edge.controlPoints()?.[0];
  if (!cp) return segmentTouches(s, t, r);
  const zoom = edge.cy().zoom();
  const pan = edge.cy().pan();
  const c = { x: cp.x * zoom + pan.x, y: cp.y * zoom + pan.y };
  let prev = s;

  for (let i = 1; i <= CURVE_STEPS; i++) {
    const k = i / CURVE_STEPS;
    const u = 1 - k;
    const p = {
      x: u * u * s.x + 2 * u * k * c.x + k * k * t.x,
      y: u * u * s.y + 2 * u * k * c.y + k * k * t.y,
    };
    if (segmentTouches(prev, p, r)) return true;
    prev = p;
  }
  return false;
}

// shift + drag on empty canvas draws a dashed box that selects vertices and edges
export function enableBoxSelect(cy: Core, container: HTMLElement, isActive: () => boolean): () => void {
  const box = document.createElement("div");
  Object.assign(box.style, {
    position: "absolute",
    display: "none",
    pointerEvents: "none",
    zIndex: "10",
    border: `1.5px dashed ${ACCENT}`,
    background: `${ACCENT}14`,
    borderRadius: "2px",
  });
  container.appendChild(box);

  let start: Position | null = null;
  let panning = true;
  let kept = new Set<string>();

  const onStart = (e: EventObject) => {
    const ev = e.originalEvent as MouseEvent | undefined;
    if (e.target !== cy || !isActive() || !ev?.shiftKey) return;
    start = { ...e.renderedPosition };
    const additive = ev.metaKey || ev.ctrlKey;
    kept = new Set(additive ? cy.$(":selected").map((el) => el.id()) : []);
    panning = cy.userPanningEnabled();
    cy.userPanningEnabled(false);
  };

  const onMove = (e: EventObject) => {
    if (!start) return;
    const p = e.renderedPosition;
    const x1 = Math.min(start.x, p.x);
    const y1 = Math.min(start.y, p.y);
    const x2 = Math.max(start.x, p.x);
    const y2 = Math.max(start.y, p.y);
    if (x2 - x1 < MIN_SIZE && y2 - y1 < MIN_SIZE) return;
    Object.assign(box.style, {
      display: "block",
      left: `${x1}px`,
      top: `${y1}px`,
      width: `${x2 - x1}px`,
      height: `${y2 - y1}px`,
    });
    const rect = { x1, y1, x2, y2 };
    cy.batch(() => {
      cy.nodes().forEach((n: NodeSingular) => {
        const bb = n.renderedBoundingBox({ includeLabels: false });
        const inside = bb.x1 <= x2 && bb.x2 >= x1 && bb.y1 <= y2 && bb.y2 >= y1;
        if (inside || kept.has(n.id())) n.select();
        else n.unselect();
      });
      cy.edges().forEach((edge: EdgeSingular) => {
        if (!edge.selectable()) return;
        if (edgeTouches(edge, rect) || kept.has(edge.id())) edge.select();
        else edge.unselect();
      });
    });
  };

  const onEnd = () => {
    if (!start) return;
    start = null;
    cy.userPanningEnabled(panning);
    if (box.style.display === "none") return;
    box.style.display = "none";
    const chosen = cy.$(":selected");
    setTimeout(() => chosen.filter((el) => !el.removed()).select(), 0);
  };

  cy.on("tapstart", onStart);
  cy.on("tapdrag", onMove);
  cy.on("tapend", onEnd);
  return () => {
    cy.off("tapstart", onStart);
    cy.off("tapdrag", onMove);
    cy.off("tapend", onEnd);
    box.remove();
  };
}
