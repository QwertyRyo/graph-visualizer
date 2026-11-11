import type { Core, EdgeSingular, EventObject, NodeSingular, Position } from "cytoscape";
import { EDGE_DASH } from "./cyStyle";

const DASH_SPEED = 30;
const HANDLE_RADIUS = 10;
const HANDLE_INSET = 7;

// moves dashes on selected edges from source to target
export function animateSelectedEdges(cy: Core): () => void {
  const period = EDGE_DASH[0] + EDGE_DASH[1];
  let frame = 0;
  let start = 0;
  function tick(now: number) {
    const selected = cy.edges(":selected");
    if (selected.empty()) {
      frame = 0;
      return;
    }
    start ||= now;
    const offset = -(((now - start) / 1000) * DASH_SPEED) % period;
    selected.style("line-dash-offset", offset);
    frame = requestAnimationFrame(tick);
  }
  const onSelect = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };
  const onUnselect = (e: EventObject) => {
    e.target.removeStyle("line-dash-offset");
  };
  cy.on("select", "edge", onSelect);
  cy.on("unselect", "edge", onUnselect);
  onSelect();
  return () => {
    cancelAnimationFrame(frame);
    cy.off("select", "edge", onSelect);
    cy.off("unselect", "edge", onUnselect);
  };
}

type End = "source" | "target";
type Drag = { edge: EdgeSingular; end: End; ghost: NodeSingular; hover: NodeSingular | null; panning: boolean };

function toScreen(cy: Core, p: Position): Position {
  const zoom = cy.zoom();
  const pan = cy.pan();
  return { x: p.x * zoom + pan.x, y: p.y * zoom + pan.y };
}

// which end of a selected edge sits under a screen point
function endAt(cy: Core, edge: EdgeSingular, screen: Position): End | null {
  if (!edge.selected()) return null;
  const src = toScreen(cy, edge.sourceEndpoint());
  const tgt = toScreen(cy, edge.targetEndpoint());
  const len = Math.hypot(tgt.x - src.x, tgt.y - src.y) || 1;
  const ux = (tgt.x - src.x) / len;
  const uy = (tgt.y - src.y) / len;
  const dist = (p: Position, dir: number) =>
    Math.hypot(p.x + dir * ux * HANDLE_INSET - screen.x, p.y + dir * uy * HANDLE_INSET - screen.y);
  const s = dist(src, 1);
  const t = dist(tgt, -1);
  if (Math.min(s, t) > HANDLE_RADIUS) return null;
  return s <= t ? "source" : "target";
}

// true when a screen point sits on any selected edge's end handle
export function overEdgeHandle(cy: Core, screen: Position): boolean {
  let over = false;
  cy.edges(":selected").forEach((edge) => {
    if (endAt(cy, edge, screen)) over = true;
  });
  return over;
}

// drag either end of a selected edge onto another vertex
export function enableEndpointDrag(
  cy: Core,
  container: HTMLElement,
  onReconnect: (edgeId: string, end: End, nodeId: string) => void,
): () => void {
  let drag: Drag | null = null;

  function nodeAt(p: Position): NodeSingular | null {
    let hit: NodeSingular | null = null;
    cy.nodes().forEach((n) => {
      const c = n.position();
      if (!n.hasClass("ep-temp") && Math.hypot(c.x - p.x, c.y - p.y) <= n.width() / 2 + 4) hit = n;
    });
    return hit;
  }

  const onStart = (e: EventObject) => {
    const edge: EdgeSingular = e.target;
    const end = endAt(cy, edge, e.renderedPosition);
    if (!end) return;
    const fixed = end === "source" ? edge.target().id() : edge.source().id();
    const ghost = cy.add({
      group: "nodes",
      data: { id: "ep-ghost" },
      position: { ...e.position },
      classes: "ep-temp ep-ghost",
      selectable: false,
      grabbable: false,
    });
    cy.add({
      group: "edges",
      data: { id: "ep-preview", source: end === "source" ? "ep-ghost" : fixed, target: end === "target" ? "ep-ghost" : fixed },
      classes: "ep-temp ep-preview",
      selectable: false,
    });
    edge.addClass("ep-dragging");
    drag = { edge, end, ghost, hover: null, panning: cy.userPanningEnabled() };
    cy.userPanningEnabled(false);
  };

  const onMove = (e: EventObject) => {
    if (!drag) return;
    const hover = nodeAt(e.position);
    if (hover !== drag.hover) {
      drag.hover?.removeClass("ep-hover");
      hover?.addClass("ep-hover");
      drag.hover = hover;
    }
    drag.ghost.position(hover ? { ...hover.position() } : { ...e.position });
  };

  
  const onEnd = () => {
    if (!drag) return;
    const { edge, end, hover, panning } = drag;
    drag = null;
    hover?.removeClass("ep-hover");
    edge.removeClass("ep-dragging");
    cy.remove(".ep-temp");
    cy.userPanningEnabled(panning);
    if (hover && !edge.removed()) onReconnect(edge.id(), end, hover.id());
  };

  // a grab cursor shows where the handles are
  const onHover = (e: EventObject) => {
    if (drag) return;
    let over = false;
    cy.edges(":selected").forEach((edge) => {
      if (endAt(cy, edge, e.renderedPosition)) {
        over = true
      } ;
    });
    container.style.cursor = over ? "grab" : "";
  };

  cy.on("tapstart", "edge", onStart);
  cy.on("tapdrag", onMove);
  cy.on("tapend", onEnd);
  cy.on("mousemove", onHover);
  return () => {
    cy.off("tapstart", "edge", onStart);
    cy.off("tapdrag", onMove);
    cy.off("tapend", onEnd);
    cy.off("mousemove", onHover);
  };
}
