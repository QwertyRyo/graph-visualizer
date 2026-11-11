import { nanoid } from "nanoid";
import { autoLabel, nextId, type IndexMode } from "./indexing";
import { DEFAULT_EDGE_COLOR, DEFAULT_EDGE_WEIGHT, DEFAULT_NODE_COLOR, MAX_LABEL_LENGTH, MAX_NODES, type GraphDoc } from "./schema";

type Point = { x: number; y: number };

// label order: a-z, then aa, ab (shorter first)
export function compareLabels(a: string, b: string): number {
  return a.length - b.length || a.localeCompare(b);
}

// a new vertex takes the smallest index whose id and default name are both free
export function addNode(doc: GraphDoc, pos: Point): GraphDoc {
  if (doc.nodes.length >= MAX_NODES) return doc;
  const id = nextId(doc.nodes, doc.indexMode);
  const label = autoLabel(id, doc.indexMode);
  const node = { id: String(id), label, x: pos.x, y: pos.y, color: DEFAULT_NODE_COLOR, isRoot: false };
  return { ...doc, nodes: [...doc.nodes, node] };
}

// switching modes only changes how new vertices are named, existing names stay
export function setIndexMode(doc: GraphDoc, mode: IndexMode): GraphDoc {
  return doc.indexMode === mode ? doc : { ...doc, indexMode: mode };
}

export function moveNode(doc: GraphDoc, id: string, pos: Point): GraphDoc {
  return moveNodes(doc, { [id]: pos });
}

// moves many vertices as one change, same doc if none moved
export function moveNodes(doc: GraphDoc, positions: Record<string, Point>): GraphDoc {
  let changed = false;
  const nodes = doc.nodes.map((n) => {
    const p = positions[n.id];
    if (!p || (p.x === n.x && p.y === n.y)) return n;
    changed = true;
    return { ...n, x: p.x, y: p.y };
  });
  return changed ? { ...doc, nodes } : doc;
}

// why a rename is not allowed, or null if it is
export function labelError(doc: GraphDoc, id: string, label: string): string | null {
  if (label === "") return "A vertex name can't be empty.";
  if (label.length > MAX_LABEL_LENGTH) return `Vertex names can be at most ${MAX_LABEL_LENGTH} characters.`;
  if (doc.nodes.some((n) => n.id !== id && n.label === label)) {
    return `Another vertex is already named "${label}". Vertex names must be unique.`;
  }
  return null;
}

export function relabelNode(doc: GraphDoc, id: string, label: string): GraphDoc {
  const current = doc.nodes.find((n) => n.id === id);
  if (!current || current.label === label || labelError(doc, id, label)) return doc;
  const nodes = doc.nodes.map((n) => (n.id === id ? { ...n, label } : n));
  return { ...doc, nodes };
}

export function removeNode(doc: GraphDoc, id: string): GraphDoc {
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => n.id !== id),
    edges: doc.edges.filter((e) => e.source !== id && e.target !== id),
  };
}

function lowerFirst(doc: GraphDoc, a: string, b: string): boolean {
  const label = (id: string) => doc.nodes.find((n) => n.id === id)?.label ?? "";
  return compareLabels(label(a), label(b)) < 0;
}

export function addEdge(doc: GraphDoc, source: string, target: string): GraphDoc {
  if (source === target) return doc;
  const ids = new Set(doc.nodes.map((n) => n.id));
  if (!ids.has(source) || !ids.has(target)) return doc;
  const exists = doc.edges.some(
    (e) =>
      (e.source === source && e.target === target) ||
      (!doc.directed && e.source === target && e.target === source),
  );
  if (exists) return doc;
  const flip = !doc.directed && lowerFirst(doc, target, source);
  const edge = {
    id: nanoid(),
    source: flip ? target : source,
    target: flip ? source : target,
    weight: DEFAULT_EDGE_WEIGHT,
    color: DEFAULT_EDGE_COLOR,
  };
  return { ...doc, edges: [...doc.edges, edge] };
}

// moves one end of an edge to another vertex, keeping its id
export function reconnectEdge(doc: GraphDoc, id: string, end: "source" | "target", nodeId: string): GraphDoc {
  const edge = doc.edges.find((e) => e.id === id);
  if (!edge || edge[end] === nodeId || !doc.nodes.some((n) => n.id === nodeId)) return doc;
  let source = end === "source" ? nodeId : edge.source;
  let target = end === "target" ? nodeId : edge.target;
  if (source === target) return doc;
  const exists = doc.edges.some(
    (e) =>
      e.id !== id &&
      ((e.source === source && e.target === target) || (!doc.directed && e.source === target && e.target === source)),
  );
  if (exists) return doc;
  if (!doc.directed && lowerFirst(doc, target, source)) [source, target] = [target, source];
  return { ...doc, edges: doc.edges.map((e) => (e.id === id ? { ...e, source, target } : e)) };
}

// flips a directed edge, unless the opposite edge already exists.
// undirected edges have no direction, so they stay as they are
export function reverseEdge(doc: GraphDoc, id: string): GraphDoc {
  const edge = doc.edges.find((e) => e.id === id);
  if (!edge || !doc.directed) return doc;
  if (doc.edges.some((e) => e.source === edge.target && e.target === edge.source)) return doc;
  return { ...doc, edges: doc.edges.map((e) => (e.id === id ? { ...e, source: edge.target, target: edge.source } : e)) };
}

export function removeEdge(doc: GraphDoc, id: string): GraphDoc {
  return { ...doc, edges: doc.edges.filter((e) => e.id !== id) };
}

export function setWeight(doc: GraphDoc, id: string, weight: number): GraphDoc {
  const edges = doc.edges.map((e) => (e.id === id ? { ...e, weight } : e));
  return { ...doc, edges };
}

export function setDirected(doc: GraphDoc, directed: boolean): GraphDoc {
  if (doc.directed === directed) return doc;
  if (directed) {
    const edges = doc.edges.map((e) =>
      lowerFirst(doc, e.target, e.source)
        ? { ...e, source: e.target, target: e.source }
        : e,
    );
    return { ...doc, directed, edges };
  }
  const seen = new Set<string>();
  const edges = doc.edges.filter((e) => {
    const key = [e.source, e.target].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...doc, directed, edges };
}

export function setWeighted(doc: GraphDoc, weighted: boolean): GraphDoc {
  return doc.weighted === weighted ? doc : { ...doc, weighted };
}

// neighbor ids sorted by label, following direction when directed
export function neighbors(doc: GraphDoc, id: string): string[] {
  const out = new Set<string>();
  for (const e of doc.edges) {
    if (e.source === id) out.add(e.target);
    else if (!doc.directed && e.target === id) out.add(e.source);
  }
  const label = new Map(doc.nodes.map((n) => [n.id, n.label]));
  return [...out].sort((a, b) =>
    compareLabels(label.get(a) ?? "", label.get(b) ?? ""),
  );
}

export function setColor(
  doc: GraphDoc,
  ids: { nodes: string[]; edges: string[] },
  color: string,
): GraphDoc {
  if (ids.nodes.length === 0 && ids.edges.length === 0) return doc;
  const nodeIds = new Set(ids.nodes);
  const edgeIds = new Set(ids.edges);
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (nodeIds.has(n.id) ? { ...n, color } : n)),
    edges: doc.edges.map((e) => (edgeIds.has(e.id) ? { ...e, color } : e)),
  };
}

// at most one root: setting a new root clears the old one
export function setRoot(doc: GraphDoc, id: string, isRoot: boolean): GraphDoc {
  const target = doc.nodes.find((n) => n.id === id);
  if (!target || target.isRoot === isRoot) return doc;
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === id ? { ...n, isRoot } : isRoot ? { ...n, isRoot: false } : n)),
  };
}

export function rootId(doc: GraphDoc): string | null {
  return doc.nodes.find((n) => n.isRoot)?.id ?? null;
}
