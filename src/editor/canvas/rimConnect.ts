import type { Core, NodeSingular, Position } from "cytoscape";
import { ringColor } from "./colors";
import { overEdgeHandle } from "./edgeInteractions";

const SVG_NS = "http://www.w3.org/2000/svg";
const RIM_INSIDE = 7;
const RIM_OUTSIDE = 8;
const STUB = 16;
const CLICK_SLOP = 6;

type Hit = { node: NodeSingular; center: Position; radius: number };

function line(svg: SVGSVGElement, attrs: Record<string, string>): SVGLineElement {
  const el = document.createElementNS(SVG_NS, "line");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  svg.appendChild(el);
  return el;
}

function place(el: SVGLineElement | SVGCircleElement, attrs: Record<string, number>) {
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
}

// hovering a vertex's rim shows a stub of edge, drag or click it to connect
export function enableRimConnect(
  cy: Core,
  container: HTMLElement,
  isActive: () => boolean,
  onConnect: (sourceId: string, targetId: string) => void,
): () => void {
  const host = container.parentElement!;
  const svg = document.createElementNS(SVG_NS, "svg");
  Object.assign(svg.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "6",
    overflow: "visible",
  });
  container.appendChild(svg);

  const stub = line(svg, { "stroke-width": "3", "stroke-linecap": "round", opacity: "0.75" });
  const tip = document.createElementNS(SVG_NS, "circle");
  tip.setAttribute("r", "3.5");
  tip.setAttribute("opacity", "0.75");
  svg.appendChild(tip);
  const band = line(svg, { "stroke-width": "2.5", "stroke-dasharray": "7 5", "stroke-linecap": "round" });
  const show = (els: Element[], on: boolean) => els.forEach((el) => el.setAttribute("visibility", on ? "visible" : "hidden"));
  show([stub, tip, band], false);

  const toLocal = (ev: MouseEvent): Position => {
    const r = container.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  function circleOf(node: NodeSingular): Hit {
    return { node, center: node.renderedPosition(), radius: node.renderedWidth() / 2 };
  }

  // the vertex whose rim is under p, nearest edge first
  function rimAt(p: Position): Hit | null {
    let best: Hit | null = null;
    let bestGap = Infinity;
    cy.nodes().forEach((node) => {
      if (node.hasClass("ep-temp")) return;
      const hit = circleOf(node);
      const d = Math.hypot(p.x - hit.center.x, p.y - hit.center.y);
      const inner = Math.max(hit.radius - RIM_INSIDE, hit.radius * 0.55);
      if (d < inner || d > hit.radius + RIM_OUTSIDE) return;
      const gap = Math.abs(d - hit.radius);
      if (gap < bestGap) [best, bestGap] = [hit, gap];
    });
    return best;
  }

  // any vertex under p other than the source, a little forgiving
  function targetAt(p: Position, source: NodeSingular): Hit | null {
    let found: Hit | null = null;
    cy.nodes().forEach((node) => {
      if (node === source || node.hasClass("ep-temp")) return;
      const hit = circleOf(node);
      if (Math.hypot(p.x - hit.center.x, p.y - hit.center.y) <= hit.radius + 4) found = hit;
    });
    return found;
  }

  // the point on a circle's edge facing p
  function rimPoint(hit: Hit, p: Position, out = 0): Position {
    const dx = p.x - hit.center.x;
    const dy = p.y - hit.center.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: hit.center.x + (dx / len) * (hit.radius + out), y: hit.center.y + (dy / len) * (hit.radius + out) };
  }

  let link: { source: NodeSingular; down: Position; dragged: boolean; target: Hit | null } | null = null;

  function drawStub(p: Position) {
    const hit = isActive() && !link && !overEdgeHandle(cy, p) ? rimAt(p) : null;
    show([stub, tip], !!hit);
    if (!hit) return;
    const a = rimPoint(hit, p);
    const b = rimPoint(hit, p, STUB);
    const color = ringColor(hit.node.data("color"));
    stub.setAttribute("stroke", color);
    tip.setAttribute("fill", color);
    place(stub, { x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    place(tip, { cx: b.x, cy: b.y });
  }

  function drawBand(p: Position) {
    if (!link) return;
    const target = targetAt(p, link.source);
    if (target?.node !== link.target?.node) {
      link.target?.node.removeClass("rim-target");
      target?.node.addClass("rim-target");
      link.target = target;
    }
    const from = circleOf(link.source);
    const end = target ? rimPoint(target, from.center) : p;
    const start = rimPoint(from, end);
    band.setAttribute("stroke", ringColor(link.source.data("color")));
    place(band, { x1: start.x, y1: start.y, x2: end.x, y2: end.y });
    show([band], true);
  }

  function finish(connect: boolean) {
    if (!link) return;
    const { source, target } = link;
    target?.node.removeClass("rim-target");
    source.removeClass("edge-source");
    link = null;
    show([band], false);
    if (connect && target && !source.removed() && !target.node.removed()) onConnect(source.id(), target.node.id());
  }

  // capture on the parent runs before cytoscape's own handlers
  const onDown = (ev: MouseEvent) => {
    if (ev.button !== 0 || !isActive()) return;
    const p = toLocal(ev);
    if (link) {
      ev.stopPropagation();
      ev.preventDefault();
      drawBand(p);
      finish(true);
      return;
    }
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey || overEdgeHandle(cy, p)) return;
    const hit = rimAt(p);
    if (!hit) return;
    ev.stopPropagation();
    ev.preventDefault();
    link = { source: hit.node, down: p, dragged: false, target: null };
    cy.elements(":selected").unselect();
    hit.node.addClass("edge-source");
    show([stub, tip], false);
    drawBand(p);
  };

  const onMove = (ev: MouseEvent) => {
    const p = toLocal(ev);
    if (link) {
      if (Math.hypot(p.x - link.down.x, p.y - link.down.y) > CLICK_SLOP) link.dragged = true;
      drawBand(p);
    } else {
      drawStub(p);
    }
  };

  const onUp = (ev: MouseEvent) => {
    if (!link || ev.button !== 0) return;
    if (link.dragged) finish(true);
  };

  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") finish(false);
  };
  const onLeave = () => show([stub, tip], false);
  const onViewport = () => {
    if (!link) show([stub, tip], false);
  };

  let swallowMouse = false;
  const onPointerDown = (ev: PointerEvent) => {
    const before = link;
    onDown(ev);
    swallowMouse = ev.defaultPrevented || before !== link;
  };
  const onMouseDown = (ev: MouseEvent) => {
    if (!swallowMouse) return;
    swallowMouse = false;
    ev.stopPropagation();
    ev.preventDefault();
  };

  host.addEventListener("pointerdown", onPointerDown, true);
  host.addEventListener("mousedown", onMouseDown, true);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("keydown", onKey);
  container.addEventListener("pointerleave", onLeave);
  cy.on("viewport", onViewport);

  return () => {
    finish(false);
    host.removeEventListener("pointerdown", onPointerDown, true);
    host.removeEventListener("mousedown", onMouseDown, true);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("keydown", onKey);
    container.removeEventListener("pointerleave", onLeave);
    cy.off("viewport", onViewport);
    svg.remove();
  };
}
