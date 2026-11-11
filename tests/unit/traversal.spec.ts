import { expect, test } from "@playwright/test";
import { addEdge, addNode, setRoot } from "../../src/domain/graph/ops";
import { emptyGraph, type GraphDoc } from "../../src/domain/graph/schema";
import { algorithmError, mstTableOrder, stateAt, traverse, type Traversal } from "../../src/domain/graph/traversal";
import { isLocked, useEditorStore } from "../../src/editor/store";

// n vertices named A, B, C… joined by edges given as "AB" pairs
function graph(n: number, pairs: string[], directed = false): GraphDoc {
  let doc: GraphDoc = { ...emptyGraph(), directed };
  for (let i = 0; i < n; i++) doc = addNode(doc, { x: i, y: 0 });
  for (const [a, b] of pairs) doc = addEdge(doc, id(doc, a), id(doc, b));
  return doc;
}

const id = (doc: GraphDoc, label: string) => doc.nodes.find((v) => v.label === label)!.id;

// label → value after the whole run, for every vertex that got one
function final(doc: GraphDoc, t: Traversal, key: "discovery" | "finish" | "low" | "distance") {
  const values = stateAt(t, t.steps.length)[key];
  return Object.fromEntries(doc.nodes.filter((n) => values.has(n.id)).map((n) => [n.label, values.get(n.id)]));
}

test.describe("depth-first search", () => {
  // the worked example: discovery, finish and low from the lecture table
  const lecture = graph(9, ["AB", "AC", "BC", "BD", "BE", "CD", "DF", "DG", "EG", "FH", "FI", "HI"]);

  test("matches the worked example", () => {
    const t = traverse(lecture, "dfs");
    expect(final(lecture, t, "discovery")).toEqual({ A: 1, B: 2, C: 3, D: 4, E: 12, F: 5, G: 11, H: 6, I: 7 });
    expect(final(lecture, t, "finish")).toEqual({ A: 18, B: 17, C: 16, D: 15, E: 13, F: 10, G: 14, H: 9, I: 8 });
    expect(final(lecture, t, "low")).toEqual({ A: 1, B: 1, C: 1, D: 2, E: 2, F: 5, G: 2, H: 5, I: 5 });
  });

  test("the stack holds the path from the root to the current vertex", () => {
    const t = traverse(lecture, "dfs");
    const label = (ids: string[]) => ids.map((v) => lecture.nodes.find((n) => n.id === v)!.label).join("");
    const reachI = t.steps.findIndex((s) => s.kind === "discover" && s.node === id(lecture, "I")) + 1;
    expect(label(stateAt(t, reachI).frontier)).toBe("ABCDFHI");
    expect(t.steps.slice(0, reachI).filter((s) => s.kind === "back-edge")).toHaveLength(2);
    expect(label(stateAt(t, t.steps.length).frontier)).toBe("");
  });

  test("the edge to the parent is not a back edge", () => {
    const doc = graph(2, ["AB"]);
    const t = traverse(doc, "dfs");
    expect(final(doc, t, "low")).toEqual({ A: 1, B: 2 });
    expect(t.steps.some((s) => s.kind === "back-edge")).toBe(false);
  });

  test("starts at the root, and unreached vertices start new trees", () => {
    let doc = graph(4, ["AB", "CD"]);
    doc = setRoot(doc, id(doc, "C"), true);
    const t = traverse(doc, "dfs");
    expect(final(doc, t, "discovery")).toEqual({ C: 1, D: 2, A: 5, B: 6 });
    expect(final(doc, t, "finish")).toEqual({ D: 3, C: 4, B: 7, A: 8 });
  });

  test("directed: follows edge direction, only back edges lower low", () => {
    // A→B→C→A is a cycle, A→C is a forward edge, D→A is a cross edge
    const doc = graph(4, ["AB", "BC", "CA", "AC", "DA"], true);
    const t = traverse(doc, "dfs");
    expect(final(doc, t, "discovery")).toEqual({ A: 1, B: 2, C: 3, D: 7 });
    expect(final(doc, t, "finish")).toEqual({ C: 4, B: 5, A: 6, D: 8 });
    expect(final(doc, t, "low")).toEqual({ A: 1, B: 1, C: 1, D: 7 });
    expect(t.steps.filter((s) => s.kind === "back-edge")).toHaveLength(1);
  });

  test("directed: a two-way pair is a back edge", () => {
    const doc = graph(2, ["AB", "BA"], true);
    expect(final(doc, traverse(doc, "dfs"), "low")).toEqual({ A: 1, B: 1 });
  });
});

test.describe("breadth-first search", () => {
  test("discovers level by level in label order", () => {
    const doc = graph(9, ["AB", "AC", "BC", "BD", "BE", "CD", "DF", "DG", "EG", "FH", "FI", "HI"]);
    const t = traverse(doc, "bfs");
    expect(final(doc, t, "discovery")).toEqual({ A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9 });
    expect(final(doc, t, "finish")).toEqual({});
    expect(final(doc, t, "distance")).toEqual({ A: 0, B: 1, C: 1, D: 2, E: 2, F: 3, G: 3, H: 4, I: 4 });
  });

  test("vertices the root can't reach are infinitely far", () => {
    let doc = graph(4, ["AB", "CD"]);
    doc = setRoot(doc, id(doc, "A"), true);
    expect(final(doc, traverse(doc, "bfs"), "distance")).toEqual({ A: 0, B: 1, C: Infinity, D: Infinity });
  });

  test("directed: only along edges", () => {
    // C can't be reached from A, so it starts its own search
    const doc = graph(3, ["AB", "CB"], true);
    const t = traverse(doc, "bfs");
    expect(final(doc, t, "discovery")).toEqual({ A: 1, B: 2, C: 3 });
    expect(t.steps.find((s) => s.kind === "discover" && s.node === id(doc, "C"))).toMatchObject({ parent: null });
  });
});

test.describe("kruskal's algorithm", () => {
  // labels of the edges kept, in the order kruskal took them
  const taken = (doc: GraphDoc, t: Traversal) => {
    const label = new Map(doc.nodes.map((n) => [n.id, n.label]));
    return t.steps.filter((s) => s.kind === "mst-edge" && s.accepted).map((s) => s.kind === "mst-edge" && `${label.get(s.node)}${label.get(s.other)}`);
  };
  const weigh = (doc: GraphDoc, weights: Record<string, number>): GraphDoc => {
    const label = new Map(doc.nodes.map((n) => [n.id, n.label]));
    return { ...doc, weighted: true, edges: doc.edges.map((e) => ({ ...e, weight: weights[`${label.get(e.source)}${label.get(e.target)}`] })) };
  };

  test("takes the cheapest edges that don't close a cycle", () => {
    // square A-B-C-D with diagonal A-C
    const doc = weigh(graph(4, ["AB", "BC", "CD", "AD", "AC"]), { AB: 1, BC: 2, CD: 3, AD: 4, AC: 2 });
    const t = traverse(doc, "kruskal");
    expect(taken(doc, t)).toEqual(["AB", "AC", "CD"]);
    expect(t.steps.filter((s) => s.kind === "mst-edge" && !s.accepted)).toHaveLength(1);
    expect(t.steps).toHaveLength(4);
    expect(stateAt(t, 0).frontier).toHaveLength(5);
  });

  test("a disconnected graph gets a spanning forest", () => {
    const doc = graph(4, ["AB", "CD"]);
    expect(taken(doc, traverse(doc, "kruskal"))).toEqual(["AB", "CD"]);
  });

  test("needs an undirected graph, but no root", () => {
    const directed = graph(2, ["AB"], true);
    expect(algorithmError(directed, "kruskal")?.message).toMatch(/undirected/);
    expect(algorithmError(graph(2, ["AB"]), "kruskal")).toBeNull();
  });
});

test.describe("prim's algorithm", () => {
  const label = (doc: GraphDoc, id: string) => doc.nodes.find((n) => n.id === id)!.label;
  // the edges prim kept, tree end first, in the order it took them
  const taken = (doc: GraphDoc, t: Traversal) =>
    t.steps.flatMap((s) => (s.kind === "mst-edge" && s.accepted ? [label(doc, s.node) + label(doc, s.other)] : []));
  const weigh = (doc: GraphDoc, weights: Record<string, number>): GraphDoc => ({
    ...doc,
    weighted: true,
    edges: doc.edges.map((e) => ({ ...e, weight: weights[label(doc, e.source) + label(doc, e.target)] })),
  });

  test("grows from the root along the cheapest edge leaving the tree", () => {
    // square A-B-C-D with diagonal A-C, rooted at D
    let doc = weigh(graph(4, ["AB", "BC", "CD", "AD", "AC"]), { AB: 1, BC: 2, CD: 3, AD: 4, AC: 2 });
    doc = setRoot(doc, id(doc, "D"), true);
    const t = traverse(doc, "prim");
    expect(taken(doc, t)).toEqual(["DC", "CA", "AB"]);
    const final = stateAt(t, t.steps.length);
    expect([...final.treeEdges].reduce((sum, e) => sum + doc.edges.find((x) => x.id === e)!.weight, 0)).toBe(6);
  });

  test("skips a candidate whose far end already joined", () => {
    // root A takes AB (1), then BC (1). AC (2) is still waiting, but C has joined,
    // so it's skipped before CD (5) reaches D
    let doc = weigh(graph(4, ["AB", "BC", "AC", "CD"]), { AB: 1, BC: 1, AC: 2, CD: 5 });
    doc = setRoot(doc, id(doc, "A"), true);
    const t = traverse(doc, "prim");
    expect(taken(doc, t)).toEqual(["AB", "BC", "CD"]);
    expect(t.steps.filter((s) => s.kind === "mst-edge" && !s.accepted)).toHaveLength(1);
  });

  test("only reaches the root's part of the graph", () => {
    let doc = graph(4, ["AB", "CD"]);
    doc = setRoot(doc, id(doc, "A"), true);
    const t = traverse(doc, "prim");
    expect(taken(doc, t)).toEqual(["AB"]);
    expect(mstTableOrder(doc, t).order).toHaveLength(2);
  });

  test("needs an undirected graph and a root", () => {
    expect(algorithmError(graph(2, ["AB"], true), "prim")?.title).toBe("Graph is directed");
    expect(algorithmError(graph(2, ["AB"]), "prim")?.title).toBe("No root vertex");
  });
});

test.describe("dijkstra's algorithm", () => {
  const label = (doc: GraphDoc, id: string) => doc.nodes.find((n) => n.id === id)!.label;
  const weigh = (doc: GraphDoc, weights: Record<string, number>): GraphDoc => ({
    ...doc,
    weighted: true,
    edges: doc.edges.map((e) => ({ ...e, weight: weights[label(doc, e.source) + label(doc, e.target)] })),
  });
  const rooted = (doc: GraphDoc, at = "A") => setRoot(doc, id(doc, at), true);
  const previous = (doc: GraphDoc, t: Traversal) =>
    Object.fromEntries([...stateAt(t, t.steps.length).previous].map(([v, p]) => [label(doc, v), label(doc, p)]));

  test("finds shortest distances, taking the longer-hop cheaper path", () => {
    const doc = rooted(weigh(graph(4, ["AB", "AC", "BC", "CD", "BD"]), { AB: 1, AC: 4, BC: 2, CD: 1, BD: 5 }));
    const t = traverse(doc, "dijkstra");
    expect(final(doc, t, "distance")).toEqual({ A: 0, B: 1, C: 3, D: 4 });
    expect(previous(doc, t)).toEqual({ B: "A", C: "B", D: "C" });
    expect(stateAt(t, t.steps.length).treeEdges.size).toBe(3);
  });

  test("a relax that improves replaces the earlier path", () => {
    const doc = rooted(weigh(graph(3, ["AB", "AC", "BC"]), { AB: 1, AC: 5, BC: 1 }));
    const t = traverse(doc, "dijkstra");
    const relaxC = t.steps.filter((s) => s.kind === "relax" && label(doc, s.other) === "C");
    expect(relaxC.map((s) => s.kind === "relax" && [s.before, s.after, s.improved])).toEqual([
      [Infinity, 5, true],
      [5, 2, true],
    ]);
  });

  test("directed: follows edge direction, unreachable stays unset", () => {
    const doc = rooted(graph(3, ["AB", "CB"], true));
    expect(final(doc, traverse(doc, "dijkstra"), "distance")).toEqual({ A: 0, B: 1 });
  });

  test("rejects negative weights, only when weighted", () => {
    const doc = rooted(weigh(graph(3, ["AB", "BC"]), { AB: 2, BC: -1 }));
    expect(algorithmError(doc, "dijkstra")).toMatchObject({ title: "Negative edge weight" });
    expect(algorithmError(doc, "dijkstra")?.message).toContain("B–C has weight -1");
    expect(algorithmError({ ...doc, weighted: false }, "dijkstra")).toBeNull();
    expect(algorithmError(doc, "prim")).toBeNull();
  });
});

test.describe("algorithm runs lock editing", () => {
  test.beforeEach(() => {
    const doc = graph(2, ["AB"]);
    useEditorStore.getState().load(setRoot(doc, id(doc, "A"), true));
  });
  test.afterEach(() => {
    useEditorStore.getState().endRun();
    useEditorStore.getState().clearFilters();
  });

  test("edits wait until done", () => {
    const s = useEditorStore.getState;
    s().startRun("dfs");
    expect(isLocked(s())).toBe(true);
    const frozen = s().doc;
    s().commit((d) => addNode(d, { x: 0, y: 0 }));
    expect(s().doc).toBe(frozen);
    s().endRun();
    s().commit((d) => addNode(d, { x: 0, y: 0 }));
    expect(s().doc.nodes).toHaveLength(3);
  });

  test("stepping stays within the run and stops playing at the end", () => {
    const s = useEditorStore.getState;
    s().startRun("bfs");
    const total = s().run!.traversal.steps.length;
    s().setPlaying(true);
    s().setRunPosition(total + 5);
    expect(s().run).toMatchObject({ position: total, playing: false });
    s().setRunPosition(-1);
    expect(s().run!.position).toBe(0);
  });

  test("dfs and bfs need a root", () => {
    const s = useEditorStore.getState;
    const doc = graph(2, ["AB"]);
    expect(algorithmError(doc, "dfs")?.message).toMatch(/root/);
    expect(algorithmError(doc, "bfs")?.message).toMatch(/root/);
    expect(algorithmError(setRoot(doc, id(doc, "B"), true), "dfs")).toBeNull();
    s().load(doc);
    s().startRun("dfs");
    expect(s().run).toBeNull();
  });

  test("filters and runs don't mix", () => {
    const s = useEditorStore.getState;
    s().toggleFilter("loops");
    s().startRun("dfs");
    expect(s().run).toBeNull();
    s().clearFilters();
    s().startRun("dfs");
    s().toggleFilter("loops");
    expect(s().filters).toEqual([]);
  });
});
