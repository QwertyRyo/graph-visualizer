import type { GraphDoc } from "./schema";
import { stateAt, traverse } from "./traversal";

export const FILTERS = [
  { id: "cut-edges", label: "Cut edges" },
  { id: "cut-vertices", label: "Cut vertices" },
  { id: "loops", label: "Loops" },
  { id: "sources", label: "Source vertices" },
  { id: "sinks", label: "Sink vertices" },
  { id: "back-edges", label: "Back edges" },
  { id: "forward-edges", label: "Forward edges" },
  { id: "cross-edges", label: "Cross edges" },
] as const;

export type FilterId = (typeof FILTERS)[number]["id"];

export type Matches = { nodes: Set<string>; edges: Set<string> };

const DIRECTED_ONLY = new Set<FilterId>(["sources", "sinks", "back-edges", "forward-edges", "cross-edges"]);

// these need edge direction
export function filterApplies(id: FilterId, directed: boolean): boolean {
  return directed || !DIRECTED_ONLY.has(id);
}

export type EdgeKinds = { tree: Set<string>; back: Set<string>; forward: Set<string>; cross: Set<string> };

// directed only: sorts every edge u→v by the dfs the algorithm player runs (same start, label order),
// comparing discovery d and finish f times:
//   back     d(v) ≤ d(u) and f(u) ≤ f(v)   v is an ancestor of u (or u itself)
//   forward  d(u) < d(v) and f(v) < f(u)   v is a descendant of u, not by a tree edge
//   cross    f(v) < d(u)                   v was finished before u was found
export function edgeKinds(doc: GraphDoc): EdgeKinds {
  const kinds: EdgeKinds = { tree: new Set(), back: new Set(), forward: new Set(), cross: new Set() };
  if (!doc.directed) return kinds;
  const t = traverse(doc, "dfs");
  const { discovery: d, finish: f, treeEdges } = stateAt(t, t.steps.length);
  for (const e of doc.edges) {
    const du = d.get(e.source)!;
    const fu = f.get(e.source)!;
    const dv = d.get(e.target)!;
    const fv = f.get(e.target)!;
    if (treeEdges.has(e.id)) kinds.tree.add(e.id);
    else if (dv <= du && fu <= fv) kinds.back.add(e.id);
    else if (du < dv && fv < fu) kinds.forward.add(e.id);
    else kinds.cross.add(e.id);
  }
  return kinds;
}

// bridges and articulation points of the graph with direction ignored.
// edges are tracked by id, so a directed a→b and b→a pair counts as two
// parallel edges and neither is a bridge
export function cuts(doc: GraphDoc): { edges: Set<string>; nodes: Set<string> } {
  const adj = new Map<string, { to: string; edge: string }[]>();
  for (const n of doc.nodes) adj.set(n.id, []);
  for (const e of doc.edges) {
    adj.get(e.source)?.push({ to: e.target, edge: e.id });
    adj.get(e.target)?.push({ to: e.source, edge: e.id });
  }

  const order = new Map<string, number>();
  const low = new Map<string, number>();
  const bridges = new Set<string>();
  const articulation = new Set<string>();
  let time = 0;

  for (const root of doc.nodes.map((n) => n.id)) {
    if (order.has(root)) continue;
    order.set(root, time);
    low.set(root, time++);
    let rootChildren = 0;
    const stack = [{ node: root, viaEdge: null as string | null, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const links = adj.get(frame.node)!;
      if (frame.next < links.length) {
        const { to, edge } = links[frame.next++];
        if (edge === frame.viaEdge) continue;
        if (order.has(to)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, order.get(to)!));
        } else {
          order.set(to, time);
          low.set(to, time++);
          if (frame.node === root) rootChildren++;
          stack.push({ node: to, viaEdge: edge, next: 0 });
        }
        continue;
      }
      stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent) continue;
      const childLow = low.get(frame.node)!;
      low.set(parent.node, Math.min(low.get(parent.node)!, childLow));
      if (childLow > order.get(parent.node)!) bridges.add(frame.viaEdge!);
      if (parent.node !== root && childLow >= order.get(parent.node)!) articulation.add(parent.node);
    }
    if (rootChildren > 1) articulation.add(root);
  }
  return { edges: bridges, nodes: articulation };
}

// vertices that can reach themselves, and the edges on those cycles.
// directed: both ends in one strongly connected component.
// undirected: any edge that is not a bridge lies on a cycle
export function cycles(doc: GraphDoc): Matches {
  if (!doc.directed) {
    const bridges = cuts(doc).edges;
    const edges = new Set(doc.edges.filter((e) => !bridges.has(e.id)).map((e) => e.id));
    const nodes = new Set<string>();
    for (const e of doc.edges) {
      if (edges.has(e.id)) nodes.add(e.source).add(e.target);
    }
    return { nodes, edges };
  }

  const out = new Map<string, string[]>();
  for (const n of doc.nodes) out.set(n.id, []);
  for (const e of doc.edges) out.get(e.source)?.push(e.target);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const component = new Map<string, number>();
  const componentSize: number[] = [];
  let time = 0;

  for (const root of doc.nodes.map((n) => n.id)) {
    if (index.has(root)) continue;
    const work = [{ node: root, next: 0 }];
    index.set(root, time);
    low.set(root, time++);
    stack.push(root);
    onStack.add(root);
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const targets = out.get(frame.node)!;
      if (frame.next < targets.length) {
        const to = targets[frame.next++];
        if (!index.has(to)) {
          index.set(to, time);
          low.set(to, time++);
          stack.push(to);
          onStack.add(to);
          work.push({ node: to, next: 0 });
        } else if (onStack.has(to)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(to)!));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));
      if (low.get(frame.node) === index.get(frame.node)) {
        const id = componentSize.length;
        let size = 0;
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          component.set(member, id);
          size++;
        } while (member !== frame.node);
        componentSize.push(size);
      }
    }
  }

  const nodes = new Set(doc.nodes.filter((n) => componentSize[component.get(n.id)!] > 1).map((n) => n.id));
  const edges = new Set(doc.edges.filter((e) => component.get(e.source) === component.get(e.target)).map((e) => e.id));
  return { nodes, edges };
}

// directed only: no edges in (sources) or no edges out (sinks)
function byDegree(doc: GraphDoc, side: "source" | "target"): Set<string> {
  if (!doc.directed) return new Set();
  const used = new Set(doc.edges.map((e) => e[side === "source" ? "target" : "source"]));
  return new Set(doc.nodes.filter((n) => !used.has(n.id)).map((n) => n.id));
}

// everything any active filter picks out
export function filterMatches(doc: GraphDoc, active: readonly FilterId[]): Matches {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const add = (m: Partial<Matches>) => {
    m.nodes?.forEach((id) => nodes.add(id));
    m.edges?.forEach((id) => edges.add(id));
  };
  const cut = active.includes("cut-edges") || active.includes("cut-vertices") ? cuts(doc) : null;
  const kinds = active.some((id) => id.endsWith("-edges") && id !== "cut-edges") ? edgeKinds(doc) : null;
  for (const id of active) {
    if (id === "cut-edges") add({ edges: cut!.edges });
    else if (id === "cut-vertices") add({ nodes: cut!.nodes });
    else if (id === "loops") add(cycles(doc));
    else if (id === "sources") add({ nodes: byDegree(doc, "source") });
    else if (id === "sinks") add({ nodes: byDegree(doc, "target") });
    else if (id === "back-edges") add({ edges: kinds!.back });
    else if (id === "forward-edges") add({ edges: kinds!.forward });
    else if (id === "cross-edges") add({ edges: kinds!.cross });
  }
  return { nodes, edges };
}
