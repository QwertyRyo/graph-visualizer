import cytoscape, { type Core, type EdgeSingular, type NodeSingular } from "cytoscape";
import edgehandles from "cytoscape-edgehandles";
import { useEffect, useRef, useState } from "react";
import { addEdge, addNode, moveNodes, reconnectEdge } from "../../domain/graph/ops";
import { enableBoxSelect } from "./boxSelect";
import { enableKeyPan } from "./keyPan";
import { enableRimConnect } from "./rimConnect";
import { enableSelectionRings } from "./selectionRing";
import type { GraphDoc } from "../../domain/graph/schema";
import { useCanvasRegistry } from "./canvasRegistry";
import { labelColor, ringColor } from "./colors";
import { graphStyle, nodeSize } from "./cyStyle";
import { animateSelectedEdges, enableEndpointDrag } from "./edgeInteractions";
import { enableEdgeLabelPlacement } from "./edgeLabels";
import { takeGrowHints } from "./growHints";
import { InlineEditor, type EditTarget } from "./InlineEditor";
import { ZoomControls } from "./ZoomControls";
import { isLocked, useEditorStore, type Tool } from "../store";
import { filterMatches } from "../../domain/graph/filters";
import { isMst, stateAt } from "../../domain/graph/traversal";

const RUN_CLASSES = "run-unseen run-open run-closed run-tree run-back run-current";

cytoscape.use(edgehandles);

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const MINOR = 20;
const MAJOR = 100;
const line = (dir: string, color: string) => `linear-gradient(to ${dir}, ${color} 1px, transparent 1px)`;

const FILTER_TINT = "rgba(15, 23, 42, 0.07)";

function paintGrid(cy: Core, el: HTMLElement, dimmed: boolean) {
  const zoom = cy.zoom();
  const { x, y } = cy.pan();
  const showMinor = MINOR * zoom >= 6;
  const layers = [
    [line("right", "#cbd5e1"), MAJOR],
    [line("bottom", "#cbd5e1"), MAJOR],
    ...(showMinor ? [[line("right", "#eef2f6"), MINOR], [line("bottom", "#eef2f6"), MINOR]] : []),
  ] as [string, number][];
  const tint = dimmed ? [`linear-gradient(${FILTER_TINT}, ${FILTER_TINT})`] : [];
  el.style.backgroundImage = [...tint, ...layers.map(([img]) => img)].join(", ");
  el.style.backgroundSize = [...tint.map(() => "100% 100%"), ...layers.map(([, s]) => `${s * zoom}px ${s * zoom}px`)].join(", ");
  el.style.backgroundPosition = [...tint.map(() => "0 0"), ...layers.map(() => `${x}px ${y}px`)].join(", ");
}

function setData(el: cytoscape.SingularElementReturnValue, key: string, value: unknown) {
  if (el.data(key) !== value) el.data(key, value);
}

const GROW_MS = 220;
const MAX_GROWN = 3;

// size and font are data, so tweening them leaves no style override behind
function growNode(cy: Core, id: string, size: number, fontSize: number) {
  const start = performance.now();
  const step = (now: number) => {
    const el = cy.getElementById(id);
    if (el.empty()) return;
    const t = Math.min((now - start) / GROW_MS, 1);
    const k = 1 - (1 - t) ** 3;
    el.data({ size: Math.max(1, size * k), fontSize: Math.max(1, fontSize * k) });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function syncToCy(cy: Core, doc: GraphDoc) {
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  const edgeIds = new Set(doc.edges.map((e) => e.id));
  const fresh = doc.nodes.filter((n) => cy.getElementById(n.id).empty());
  const hinted = takeGrowHints();
  const smallBatch = fresh.length > 0 && fresh.length <= MAX_GROWN;
  const growing: { id: string; size: number; fontSize: number }[] = [];

  cy.batch(() => {
    cy.elements()
      .not(".eh-ghost, .eh-preview, .ep-temp")
      .forEach((el) => {
        const ids = el.group() === "nodes" ? nodeIds : edgeIds;
        if (!ids.has(el.id()) && !el.removed()) el.remove();
      });

    for (const n of doc.nodes) {
      const el = cy.getElementById(n.id);
      const { size, fontSize } = nodeSize(n.label);
      if (el.empty()) {
        const grow = smallBatch || hinted.has(n.id);
        if (grow) {
          growing.push({ id: n.id, size, fontSize });
        }
        cy.add({
          group: "nodes",
          data: {
            id: n.id,
            label: n.label,
            size: grow ? 1 : size,
            fontSize: grow ? 1 : fontSize,
            color: n.color,
            textColor: labelColor(n.color),
            ring: ringColor(n.color),
            isRoot: n.isRoot,
          },
          position: { x: n.x, y: n.y },
        });
        continue;
      }
      setData(el, "label", n.label);
      setData(el, "size", size);
      setData(el, "fontSize", fontSize);
      setData(el, "color", n.color);
      setData(el, "textColor", labelColor(n.color));
      setData(el, "ring", ringColor(n.color));
      setData(el, "isRoot", n.isRoot);
      const p = el.position();
      if (p.x !== n.x || p.y !== n.y) el.position({ x: n.x, y: n.y });
    }

    for (const e of doc.edges) {
      let el = cy.getElementById(e.id);
      let reselect = false;
      if (!el.empty() && (el.data("source") !== e.source || el.data("target") !== e.target)) {
        reselect = el.selected();
        el.remove();
        el = cy.collection();
      }
      if (el.empty()) {
        const added = cy.add({
          group: "edges",
          data: { id: e.id, source: e.source, target: e.target, weight: e.weight, color: e.color },
        });
        if (reselect) added.select();
      } else {
        setData(el, "weight", e.weight);
        setData(el, "color", e.color);
      }
    }
  });

  for (const g of growing) 
    growNode(cy, g.id, g.size, g.fontSize);
}

export function GraphCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const container = containerRef.current!;
    const store = useEditorStore;
    const registry = useCanvasRegistry.getState();
    const cy = cytoscape({
      container,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      boxSelectionEnabled: false,
      wheelSensitivity: 0.3,
    });
    const eh = cy.edgehandles({ canConnect: (source, target) => source.id() !== target.id() });
    let drawMode = false;
    let pendingSource: NodeSingular | null = null;

    function clearPending() {
      pendingSource?.removeClass("edge-source");
      pendingSource = null;
    }

    function applyTool(tool: Tool) {
      clearPending();
      applySelectable(tool);
      if (tool === "edge" && !drawMode) eh.enableDrawMode();
      if (tool !== "edge" && drawMode) eh.disableDrawMode();
      drawMode = tool === "edge";
    }

    // vertices are selectable except in edge mode, edges except in vertex mode
    const canSelect = (tool: Tool, group: "nodes" | "edges") =>
      tool === "select" || (tool === "node" ? group === "nodes" : group === "edges");

    function applySelectable(tool: Tool) {
      for (const [group, els] of [["nodes", cy.nodes()], ["edges", cy.edges()]] as const) {
        if (canSelect(tool, group)) {
          els.not(".ep-temp").selectify();
        }
        else {
          els.unselect().unselectify()
        };
      }
    }

    cy.on("add", (e) => {
      const el = e.target;
      if (!el.hasClass("ep-temp") && !canSelect(store.getState().tool, el.group())) el.unselectify();
    });

    const locked = () => isLocked(store.getState());

    // a filter freezes editing but keeps pan and zoom, so the graph can still be explored
    function applyLock() {
      const on = locked();
      cy.autoungrabify(on);
      cy.autounselectify(on);
      if (on) {
        clearPending();
        cy.elements(":selected").unselect();
        setEditing(null);
        if (drawMode) eh.disableDrawMode();
        drawMode = false;
        eh.disable();
      } else {
        eh.enable();
        applyTool(store.getState().tool);
      }
      cy.edges().toggleClass("on-tint", on);
      paintGrid(cy, container, on);
    }

    function applyFilterClasses() {
      const { doc, filters } = store.getState();
      const matches = filterMatches(doc, filters);
      cy.batch(() => {
        cy.elements().removeClass("filter-dim filter-match");
        if (filters.length === 0) return;
        cy.nodes().forEach((n) => {
          if (!matches.nodes.has(n.id())) n.addClass("filter-dim");
        });
        cy.edges().forEach((e) => {
          // matching edges thicken so they stand out from the faded rest
          if (matches.edges.has(e.id())) e.addClass("filter-match");
          else e.addClass("filter-dim");
        });
      });
    }

    // paints the algorithm's progress at the current step
    function applyRunClasses() {
      const { run } = store.getState();
      cy.batch(() => {
        cy.elements().removeClass(RUN_CLASSES);
        if (!run) return;
        const state = stateAt(run.traversal, run.position);
        const kruskal = isMst(run.traversal.algorithm);
        cy.nodes().forEach((n) => {
          const status = state.status.get(n.id());
          if (status) n.addClass(status === "open" ? "run-open" : "run-closed");
          else if (!kruskal) n.addClass("run-unseen");
        });
        cy.edges().forEach((e) => {
          if (state.treeEdges.has(e.id())) e.addClass("run-tree");
          else if (state.backEdges.has(e.id())) e.addClass("run-back");
          else if (!kruskal || state.rejectedEdges.has(e.id())) e.addClass("run-unseen");
        });
        const step = state.step;
        if (!step) return;
        cy.getElementById(step.node).addClass("run-current");
        if (step.kind === "mst-edge" || step.kind === "relax") cy.getElementById(step.other).addClass("run-current");
        if ("edge" in step && step.edge) cy.getElementById(step.edge).addClass("run-current");
      });
    }

    const initial = store.getState();
    cy.style(graphStyle(initial.doc.directed, initial.doc.weighted));
    const labels = enableEdgeLabelPlacement(cy, () => store.getState().doc.weighted);
    syncToCy(cy, initial.doc);
    applyTool(initial.tool);

    const unsubscribe = store.subscribe((s, prev) => {
      if (s.doc !== prev.doc) {
        if (s.doc.directed !== prev.doc.directed || s.doc.weighted !== prev.doc.weighted) {
          cy.style(graphStyle(s.doc.directed, s.doc.weighted));
          labels.refresh();
        }
        syncToCy(cy, s.doc);
        setEditing(null);
      }
      if (isLocked(s) !== isLocked(prev)) applyLock();
      if (s.filters !== prev.filters || (s.doc !== prev.doc && isLocked(s))) applyFilterClasses();
      if (s.run !== prev.run) applyRunClasses();
      if (s.tool !== prev.tool && !isLocked(s)) applyTool(s.tool);
    });

    let pressAt = { x: 0, y: 0 };
    let travelled = false;
    let panPress = false;
    cy.on("tapstart", (e) => {
      pressAt = e.renderedPosition;
      travelled = false;
      const shift = (e.originalEvent as MouseEvent | undefined)?.shiftKey;
      panPress = e.target === cy && !shift && cy.userPanningEnabled();
    });
    cy.on("tapdrag", (e) => {
      const p = e.renderedPosition;
      if (Math.hypot(p.x - pressAt.x, p.y - pressAt.y) > 6) travelled = true;
      if (panPress && travelled) container.classList.add("cursor-grabbing!");
    });
    cy.on("tapend", () => {
      panPress = false;
      container.classList.remove("cursor-grabbing!");
    });

    cy.on("tap", (e) => {
      const { tool, commit } = store.getState();
      if (travelled || locked())
        return;
      if (e.target === cy && tool != "edge"){
        if (cy.elements(":selected").length > 0)
          cy.elements(":selected").unselect();
        else
          commit((d) => addNode(d, e.position));

      }

      if (tool !== "edge") 
        return;
      if (e.target === cy || !e.target.isNode()) 
        return clearPending();
      const node: NodeSingular = e.target;
      if (!pendingSource || pendingSource.removed()) {
        pendingSource = node;
        cy.elements(":selected").unselect();
        node.addClass("edge-source");
        return;
      }
      const sourceId = pendingSource.id();
      clearPending();
      if (sourceId !== node.id()) commit((d) => addEdge(d, sourceId, node.id()));
    });

    cy.on("drag", "node", () => container.classList.add("cursor-move!"));
    cy.on("free", "node", () => container.classList.remove("cursor-move!"));

    cy.on("dragfree", "node", () => {
      const positions: Record<string, { x: number; y: number }> = {};
      cy.nodes().forEach((n) => {
        positions[n.id()] = { ...n.position() };
      });
      store.getState().commit((d) => moveNodes(d, positions));
    });

    cy.on("ehstart", () => cy.elements(":selected").unselect());

    cy.on("ehcomplete",(_e, source: NodeSingular, target: NodeSingular, added: EdgeSingular) => {
      added.remove();
      store.getState().commit((d) => addEdge(d, source.id(), target.id()));
    });

    cy.on("select unselect", () => {
      const sel = cy.$(":selected");
      store.getState().setSelection({
        nodes: sel.nodes().map((n) => n.id()),
        edges: sel.edges().map((e) => e.id()),
      });
    });

    cy.on("dbltap", "node", (e) => {
      if (locked()) return;
      const node: NodeSingular = e.target;
      const p = node.renderedPosition();
      setEditing({ kind: "node", id: node.id(), x: p.x, y: p.y, value: node.data("label"), width: node.renderedWidth() });
    });

    cy.on("dbltap", "edge", (e) => {
      if (!store.getState().doc.weighted || locked()) return;
      const edge: EdgeSingular = e.target;
      const m = edge.renderedMidpoint();
      const zoom = cy.zoom();
      const x = m.x + (edge.data("labelDx") ?? 0) * zoom;
      const y = m.y + (edge.data("labelDy") ?? 0) * zoom;
      setEditing({ kind: "edge", id: edge.id(), x, y, value: String(edge.data("weight")) });
    });

    cyRef.current = cy;
    cy.on("zoom", () => setZoom(cy.zoom()));

    cy.on("viewport", () => {
      setEditing(null);
      paintGrid(cy, container, locked());
    });
    applyLock();
    applyFilterClasses();
    applyRunClasses();

    const stopDashes = animateSelectedEdges(cy);
    const stopEndpointDrag = enableEndpointDrag(cy, container, (edgeId, end, nodeId) =>
      store.getState().commit((d) => reconnectEdge(d, edgeId, end, nodeId)),
    );

    const stopKeyPan = enableKeyPan(cy);
    const stopRings = enableSelectionRings(cy, container);
    const stopBoxSelect = enableBoxSelect(cy, container, () => !locked());
    const stopRimConnect = enableRimConnect(
      cy,
      container,
      () => store.getState().tool !== "edge" && !locked(),
      (source, target) => store.getState().commit((d) => addEdge(d, source, target)),
    );

    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") clearPending();
    };
    window.addEventListener("keydown", onKeyDown);

    const resizeObserver = new ResizeObserver(() => cy.resize());
    resizeObserver.observe(container);
    const activate = () => useCanvasRegistry.getState().activate(cy);
    container.addEventListener("pointerdown", activate);
    registry.register(cy);

    return () => {
      useCanvasRegistry.getState().unregister(cy);
      container.removeEventListener("pointerdown", activate);
      window.removeEventListener("keydown", onKeyDown);
      stopBoxSelect();
      stopRimConnect();
      stopRings();
      labels.stop();
      stopKeyPan();
      resizeObserver.disconnect();
      unsubscribe();
      stopDashes();
      stopEndpointDrag();
      eh.destroy();
      cyRef.current = null;
      cy.destroy();
    };
  }, []);

  // zoom about the middle of the view, not the corner
  function zoomTo(level: number) {
    const cy = cyRef.current;
    if (!cy) return;
    cy.stop();
    cy.animate({ zoom: { level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } }, { duration: 150 });
  }

  return (
    <div className="relative isolate h-full w-full overflow-hidden bg-white">
      <div ref={containerRef} className="h-full w-full" />
      {editing && (
        <InlineEditor key={editing.id} target={editing} onDone={() => setEditing(null)} />
      )}
      <ZoomControls zoom={zoom} min={MIN_ZOOM} max={MAX_ZOOM} onZoom={zoomTo} />
    </div>
  );
}
