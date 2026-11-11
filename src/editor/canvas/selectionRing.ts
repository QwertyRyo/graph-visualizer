import type { Core } from "cytoscape";
import { ringColor } from "./colors";

const RING_GAP = 5;
const SPIN_SECONDS = 6;
const SVG_NS = "http://www.w3.org/2000/svg";

// a spinning dashed ring in each selected vertex's own color
export function enableSelectionRings(cy: Core, container: HTMLElement): () => void {
  const svg = document.createElementNS(SVG_NS, "svg");
  Object.assign(svg.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "5",
    overflow: "hidden",
  });
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = `
    @keyframes ring-spin { to { transform: rotate(360deg); } }
    .sel-ring { transform-box: fill-box; transform-origin: center; animation: ring-spin ${SPIN_SECONDS}s linear infinite; }
  `;
  svg.appendChild(style);
  container.appendChild(svg);

  const rings = new Map<string, SVGCircleElement>();
  let frame = 0;

  function ringFor(id: string): SVGCircleElement {
    let ring = rings.get(id);
    if (!ring) {
      ring = document.createElementNS(SVG_NS, "circle");
      ring.setAttribute("class", "sel-ring");
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke-width", "2.5");
      ring.setAttribute("stroke-linecap", "round");
      svg.appendChild(ring);
      rings.set(id, ring);
    }
    return ring;
  }

  function tick() {
    const selected = cy.nodes(":selected");
    const live = new Set<string>();
    const zoom = cy.zoom();
    selected.forEach((n) => {
      const id = n.id();
      live.add(id);
      const p = n.renderedPosition();
      const r = (n.width() / 2 + RING_GAP) * zoom;
      const ring = ringFor(id);
      ring.setAttribute("cx", String(p.x));
      ring.setAttribute("cy", String(p.y));
      ring.setAttribute("r", String(r));
      ring.setAttribute("stroke", ringColor(n.data("color")));
      const dash = (2 * Math.PI * r) / 24;
      ring.setAttribute("stroke-dasharray", `${dash} ${dash}`);
    });
    for (const [id, ring] of rings) {
      if (!live.has(id)) {
        ring.remove();
        rings.delete(id);
      }
    }
    frame = selected.empty() ? 0 : requestAnimationFrame(tick);
  }

  const wake = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };
  cy.on("select unselect remove", wake);
  wake();
  return () => {
    cancelAnimationFrame(frame);
    cy.off("select unselect remove", wake);
    svg.remove();
  };
}
