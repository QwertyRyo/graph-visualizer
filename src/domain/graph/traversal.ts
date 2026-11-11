import { compareLabels, rootId } from "./ops";
import type { GraphDoc, GraphEdge } from "./schema";
export const ALGORITHMS = [
  { id: "dfs", label: "Depth-first search (DFS)", needsRoot: true, needsUndirected: false, needsNonNegative: false },
  { id: "bfs", label: "Breadth-first search (BFS)", needsRoot: true, needsUndirected: false, needsNonNegative: false },
  { id: "kruskal", label: "Kruskal's algorithm", needsRoot: false, needsUndirected: true, needsNonNegative: false },
  { id: "prim", label: "Prim's algorithm", needsRoot: true, needsUndirected: true, needsNonNegative: false },
  { id: "dijkstra", label: "Dijkstra's algorithm", needsRoot: true, needsUndirected: false, needsNonNegative: true },
] as const;

export type AlgorithmId = (typeof ALGORITHMS)[number]["id"];

export const isMst = (id: AlgorithmId) => id === "kruskal" || id === "prim";

export function algorithmError(doc: GraphDoc, id: AlgorithmId): { title: string; message: string } | null {
  const algorithm = ALGORITHMS.find((a) => a.id === id)!;
  if (algorithm.needsUndirected && doc.directed) {
    return { title: "Graph is directed", message: `${algorithm.label} needs an undirected graph. Untick Directed, then try again.` };
  }
  if (algorithm.needsRoot && !rootId(doc)) {
    return { title: "No root vertex", message: `${algorithm.label} starts from the root vertex. Select a vertex and tick Root, then try again.` };
  }
  const negative = algorithm.needsNonNegative && doc.weighted ? doc.edges.find((e) => e.weight < 0) : undefined;
  if (negative) {
    const label = (id: string) => doc.nodes.find((n) => n.id === id)?.label ?? "?";
    const edge = `${label(negative.source)}${doc.directed ? "→" : "–"}${label(negative.target)}`;
    return {
      title: "Negative edge weight",
      message: `${algorithm.label} needs every edge weight to be 0 or more, but ${edge} has weight ${negative.weight}. Change the negative weights, then try again.`,
    };
  }
  return null;
}

export type LowChange = { node: string; value: number };

type Common = {
  node: string;
  low: LowChange[];
  frontier: string[];
};

export type Step =
  | (Common & { kind: "discover"; time: number; parent: string | null; edge: string | null })
  | (Common & { kind: "back-edge"; ancestor: string; edge: string })
  | (Common & { kind: "finish"; time: number; parent: string | null; edge: string | null })
  | (Common & { kind: "visit" })
  | (Common & { kind: "mst-edge"; edge: string; other: string; weight: number; accepted: boolean })
  | (Common & { kind: "relax"; edge: string; other: string; weight: number; before: number; after: number; improved: boolean });

export type Traversal = { algorithm: AlgorithmId; start: string | null; steps: Step[] };

export function startVertex(doc: GraphDoc): string | null {
  return rootId(doc) ?? byLabel(doc)[0] ?? null;
}

function byLabel(doc: GraphDoc): string[] {
  return [...doc.nodes].sort((a, b) => compareLabels(a.label, b.label)).map((n) => n.id);
}

function adjacency(doc: GraphDoc): Map<string, { to: string; edge: string }[]> {
  const label = new Map(doc.nodes.map((n) => [n.id, n.label]));
  const adj = new Map(doc.nodes.map((n) => [n.id, [] as { to: string; edge: string }[]]));
  for (const e of doc.edges) {
    adj.get(e.source)?.push({ to: e.target, edge: e.id });
    if (!doc.directed) adj.get(e.target)?.push({ to: e.source, edge: e.id });
  }
  for (const list of adj.values()) list.sort((a, b) => compareLabels(label.get(a.to)!, label.get(b.to)!));
  return adj;
}

// the start first, then the rest by label, so every vertex left unreached starts a new tree
function treeRoots(doc: GraphDoc, start: string | null): string[] {
  const order = byLabel(doc);
  return start && order.includes(start) ? [start, ...order.filter((id) => id !== start)] : order;
}

// discovery and finish share one clock from 1. low(v) is the smallest discovery time
// reachable from v by tree edges down then one back edge up, or d(v) if none
function dfs(doc: GraphDoc, start: string | null): Step[] {
  const adj = adjacency(doc);
  const steps: Step[] = [];
  const d = new Map<string, number>();
  const low = new Map<string, number>();
  const finished = new Set<string>();
  const stack: { node: string; via: string | null; next: number }[] = [];
  const frontier = () => stack.map((f) => f.node);
  let time = 0;

  const discover = (node: string, parent: string | null, edge: string | null) => {
    d.set(node, ++time);
    low.set(node, time);
    stack.push({ node, via: edge, next: 0 });
    steps.push({ kind: "discover", node, parent, edge, time, low: [], frontier: frontier() });
  };

  for (const root of treeRoots(doc, start)) {
    if (d.has(root)) continue;
    discover(root, null, null);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const links = adj.get(frame.node)!;
      if (frame.next < links.length) {
        const { to, edge } = links[frame.next++];
        if (!d.has(to)) {
          discover(to, frame.node, edge);
        } else if (!finished.has(to) && edge !== frame.via) {
          const changes: LowChange[] = [];
          if (d.get(to)! < low.get(frame.node)!) {
            low.set(frame.node, d.get(to)!);
            changes.push({ node: frame.node, value: d.get(to)! });
          }
          steps.push({ kind: "back-edge", node: frame.node, ancestor: to, edge, low: changes, frontier: frontier() });
        }
        continue;
      }
      stack.pop();
      finished.add(frame.node);
      const parent = stack[stack.length - 1]?.node ?? null;
      const changes: LowChange[] = [];
      if (parent && low.get(frame.node)! < low.get(parent)!) {
        low.set(parent, low.get(frame.node)!);
        changes.push({ node: parent, value: low.get(frame.node)! });
      }
      steps.push({ kind: "finish", node: frame.node, parent, edge: frame.via, time: ++time, low: changes, frontier: frontier() });
    }
  }
  return steps;
}

// discovery times count from 1 in the order vertices join the queue
function bfs(doc: GraphDoc, start: string | null): Step[] {
  const adj = adjacency(doc);
  const steps: Step[] = [];
  const discovered = new Set<string>();
  const queue: string[] = [];
  let time = 0;

  const discover = (node: string, parent: string | null, edge: string | null) => {
    discovered.add(node);
    queue.push(node);
    steps.push({ kind: "discover", node, parent, edge, time: ++time, low: [], frontier: [...queue] });
  };

  for (const root of treeRoots(doc, start)) {
    if (discovered.has(root)) continue;
    discover(root, null, null);
    while (queue.length > 0) {
      const node = queue.shift()!;
      steps.push({ kind: "visit", node, low: [], frontier: [...queue] });
      for (const { to, edge } of adj.get(node)!) {
        if (!discovered.has(to)) discover(to, node, edge);
      }
    }
  }
  return steps;
}

export const edgeWeight = (doc: GraphDoc, weight: number) => (doc.weighted ? weight : 1);
function byWeight(doc: GraphDoc) {
  const label = new Map(doc.nodes.map((n) => [n.id, n.label]));
  return (a: GraphEdge, b: GraphEdge) =>
    edgeWeight(doc, a.weight) - edgeWeight(doc, b.weight) ||
    compareLabels(label.get(a.source)!, label.get(b.source)!) ||
    compareLabels(label.get(a.target)!, label.get(b.target)!);
}

function kruskal(doc: GraphDoc): Step[] {
  const edges = [...doc.edges].sort(byWeight(doc));

  const parent = new Map(doc.nodes.map((n) => [n.id, n.id]));
  const find = (v: string) => {
    while (parent.get(v) !== v) {
      parent.set(v, parent.get(parent.get(v)!)!);
      v = parent.get(v)!;
    }
    return v;
  };

  const steps: Step[] = [];
  let kept = 0;
  for (let i = 0; i < edges.length && kept < doc.nodes.length - 1; i++) {
    const e = edges[i];
    const [a, b] = [find(e.source), find(e.target)];
    const accepted = a !== b;
    if (accepted) {
      parent.set(a, b);
      kept++;
    }
    const frontier = edges.slice(i + 1).map((x) => x.id);
    steps.push({ kind: "mst-edge", node: e.source, other: e.target, edge: e.id, weight: edgeWeight(doc, e.weight), accepted, low: [], frontier });
  }
  return steps;
}

function prim(doc: GraphDoc, start: string | null): Step[] {
  if (!start) return [];
  const order = byWeight(doc);
  const inTree = new Set<string>();
  let candidates: GraphEdge[] = [];
  const steps: Step[] = [];

  const grow = (v: string) => {
    inTree.add(v);
    const leaving = doc.edges.filter((e) => (e.source === v && !inTree.has(e.target)) || (e.target === v && !inTree.has(e.source)));
    candidates = [...candidates, ...leaving].sort(order);
  };
  const frontier = () => candidates.map((e) => e.id);

  grow(start);
  steps.push({ kind: "discover", node: start, parent: null, edge: null, time: 1, low: [], frontier: frontier() });
  while (candidates.length > 0 && inTree.size < doc.nodes.length) {
    const e = candidates.shift()!;
    const [near, far] = inTree.has(e.source) ? [e.source, e.target] : [e.target, e.source];
    const accepted = !inTree.has(far);
    if (accepted) grow(far);
    steps.push({ kind: "mst-edge", node: near, other: far, edge: e.id, weight: edgeWeight(doc, e.weight), accepted, low: [], frontier: frontier() });
  }
  return steps;
}

function dijkstra(doc: GraphDoc, start: string | null): Step[] {
  if (!start) return [];
  const label = new Map(doc.nodes.map((n) => [n.id, n.label]));
  const adj = adjacency(doc);
  const weight = new Map(doc.edges.map((e) => [e.id, edgeWeight(doc, e.weight)]));
  const dist = new Map<string, number>([[start, 0]]);
  const done = new Set<string>();
  const queue = () =>
    [...dist.keys()]
      .filter((v) => !done.has(v))
      .sort((a, b) => dist.get(a)! - dist.get(b)! || compareLabels(label.get(a)!, label.get(b)!));

  const steps: Step[] = [{ kind: "discover", node: start, parent: null, edge: null, time: 1, low: [], frontier: queue() }];
  for (let waiting = queue(); waiting.length > 0; waiting = queue()) {
    const u = waiting[0];
    done.add(u);
    steps.push({ kind: "visit", node: u, low: [], frontier: queue() });
    for (const { to, edge } of adj.get(u)!) {
      if (done.has(to)) continue;
      const before = dist.get(to) ?? Infinity;
      const after = dist.get(u)! + weight.get(edge)!;
      const improved = after < before;
      if (improved) dist.set(to, after);
      steps.push({ kind: "relax", node: u, other: to, edge, weight: weight.get(edge)!, before, after, improved, low: [], frontier: queue() });
    }
  }
  return steps;
}

export function mstTableOrder(doc: GraphDoc, t: Traversal): { order: string[]; unneeded: Set<string> } {
  const checked = t.steps.flatMap((s) => (s.kind === "mst-edge" ? [s.edge] : []));
  const waiting = t.steps[t.steps.length - 1]?.frontier ?? [];
  const seen = new Set([...checked, ...waiting]);
  const rest = [...doc.edges].sort(byWeight(doc)).map((e) => e.id).filter((id) => !seen.has(id));
  return { order: [...checked, ...waiting, ...rest], unneeded: new Set(waiting) };
}

export function kruskalOrder(t: Traversal): string[] {
  return t.steps.length > 0 && t.steps[0].kind === "mst-edge" ? [t.steps[0].edge, ...t.steps[0].frontier] : [];
}

export function traverse(doc: GraphDoc, algorithm: AlgorithmId, start = startVertex(doc)): Traversal {
  if (algorithm === "kruskal") return { algorithm, start: null, steps: kruskal(doc) };
  if (algorithm === "prim") return { algorithm, start, steps: prim(doc, start) };
  if (algorithm === "dijkstra") return { algorithm, start, steps: dijkstra(doc, start) };
  return { algorithm, start, steps: algorithm === "dfs" ? dfs(doc, start) : bfs(doc, start) };
}

export type TraversalState = {
  discovery: Map<string, number>;
  finish: Map<string, number>;
  low: Map<string, number>;
  distance: Map<string, number>;
  status: Map<string, "open" | "closed">;
  treeEdges: Set<string>;
  backEdges: Set<string>;
  rejectedEdges: Set<string>;
  previous: Map<string, string>;
  frontier: string[];
  step: Step | null;
};

// the state after the first `position` steps
export function stateAt(t: Traversal, position: number): TraversalState {
  const n = Math.max(0, Math.min(position, t.steps.length));
  const s: TraversalState = {
    discovery: new Map(),
    finish: new Map(),
    low: new Map(),
    distance: new Map(),
    status: new Map(),
    treeEdges: new Set(),
    backEdges: new Set(),
    rejectedEdges: new Set(),
    previous: new Map(),
    frontier: n > 0 ? t.steps[n - 1].frontier : t.algorithm === "kruskal" ? kruskalOrder(t) : [],
    step: n > 0 ? t.steps[n - 1] : null,
  };
  const via = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    const step = t.steps[i];
    if (step.kind === "relax") {
      if (step.improved) {
        s.distance.set(step.other, step.after);
        s.status.set(step.other, "open");
        s.previous.set(step.other, step.node);
        via.set(step.other, step.edge);
      }
    } else if (step.kind === "discover" && t.algorithm === "dijkstra") {
      s.status.set(step.node, "open");
      s.distance.set(step.node, 0);
    } else if (step.kind === "discover" && t.algorithm === "prim") {
      s.status.set(step.node, "closed");
    } else if (step.kind === "discover") {
      s.status.set(step.node, "open");
      s.discovery.set(step.node, step.time);
      if (t.algorithm === "dfs") s.low.set(step.node, step.time);
      if (t.algorithm === "bfs") {
        const d = step.parent ? s.distance.get(step.parent)! + 1 : step.node === t.start ? 0 : Infinity;
        s.distance.set(step.node, d);
      }
      if (step.edge) s.treeEdges.add(step.edge);
    } else if (step.kind === "back-edge") {
      s.backEdges.add(step.edge);
    } else if (step.kind === "mst-edge") {
      if (step.accepted) {
        s.treeEdges.add(step.edge);
        s.status.set(step.node, "closed").set(step.other, "closed");
      } else {
        s.rejectedEdges.add(step.edge);
      }
    } else {
      s.status.set(step.node, "closed");
      if (step.kind === "finish") s.finish.set(step.node, step.time);
    }
    for (const c of step.low) s.low.set(c.node, c.value);
  }
  if (t.algorithm === "dijkstra") s.treeEdges = new Set(via.values());
  return s;
}
