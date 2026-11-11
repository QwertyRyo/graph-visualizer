import { expect, test } from "@playwright/test";
import { cuts, cycles, edgeKinds, filterApplies, filterMatches } from "../../src/domain/graph/filters";
import { addEdge, addNode } from "../../src/domain/graph/ops";
import { emptyGraph, type GraphDoc } from "../../src/domain/graph/schema";
import { useEditorStore } from "../../src/editor/store";

// n vertices named A, B, C… joined by edges given as "AB" pairs
function graph(n: number, pairs: string[], directed = false): GraphDoc {
  let doc: GraphDoc = { ...emptyGraph(), directed };
  for (let i = 0; i < n; i++) doc = addNode(doc, { x: i, y: 0 });
  const id = (label: string) => doc.nodes.find((v) => v.label === label)!.id;
  for (const [a, b] of pairs) doc = addEdge(doc, id(a), id(b));
  return doc;
}

const labelsOf = (doc: GraphDoc, ids: Set<string>) =>
  doc.nodes.filter((n) => ids.has(n.id)).map((n) => n.label).sort();
const edgesOf = (doc: GraphDoc, ids: Set<string>) => {
  const label = new Map(doc.nodes.map((n) => [n.id, n.label]));
  return doc.edges.filter((e) => ids.has(e.id)).map((e) => `${label.get(e.source)}${label.get(e.target)}`).sort();
};

test.describe("cut edges and vertices", () => {
  test("a path: every edge is a bridge, inner vertices are cuts", () => {
    const doc = graph(4, ["AB", "BC", "CD"]);
    const c = cuts(doc);
    expect(edgesOf(doc, c.edges)).toEqual(["AB", "BC", "CD"]);
    expect(labelsOf(doc, c.nodes)).toEqual(["B", "C"]);
  });

  test("a cycle has no cuts", () => {
    const c = cuts(graph(4, ["AB", "BC", "CD", "DA"]));
    expect(c.edges.size).toBe(0);
    expect(c.nodes.size).toBe(0);
  });

  test("two triangles joined by a bridge", () => {
    // A-B-C triangle, D-E-F triangle, C-D bridge
    const doc = graph(6, ["AB", "BC", "CA", "DE", "EF", "FD", "CD"]);
    const c = cuts(doc);
    expect(edgesOf(doc, c.edges)).toEqual(["CD"]);
    expect(labelsOf(doc, c.nodes)).toEqual(["C", "D"]);
  });

  test("a star's centre is the only cut vertex", () => {
    const doc = graph(4, ["AB", "AC", "AD"]);
    expect(labelsOf(doc, cuts(doc).nodes)).toEqual(["A"]);
  });

  test("directed graphs ignore direction, and a two-way pair is not a bridge", () => {
    const oneWay = graph(3, ["AB", "BC"], true);
    expect(cuts(oneWay).edges.size).toBe(2);
    const twoWay = graph(2, ["AB", "BA"], true);
    expect(cuts(twoWay).edges.size).toBe(0);
  });

  test("works across separate pieces and on a long path", () => {
    const doc = graph(5, ["AB", "CD", "DE"]);
    expect(edgesOf(doc, cuts(doc).edges)).toEqual(["AB", "CD", "DE"]);
    const long = graph(26, Array.from({ length: 25 }, (_, i) => String.fromCharCode(65 + i, 66 + i)));
    expect(cuts(long).nodes.size).toBe(24);
  });
});

test.describe("loops", () => {
  test("directed: only vertices that can get back to themselves", () => {
    // A→B→C→A is a cycle, C→D leads out of it
    const doc = graph(4, ["AB", "BC", "CA", "CD"], true);
    const m = cycles(doc);
    expect(labelsOf(doc, m.nodes)).toEqual(["A", "B", "C"]);
    expect(edgesOf(doc, m.edges)).toEqual(["AB", "BC", "CA"]);
  });

  test("directed: a one-way chain has no loops, a two-way pair does", () => {
    expect(cycles(graph(3, ["AB", "BC", "AC"], true)).nodes.size).toBe(0);
    const pair = graph(2, ["AB", "BA"], true);
    expect(labelsOf(pair, cycles(pair).nodes)).toEqual(["A", "B"]);
  });

  test("undirected: the triangle, not the tail", () => {
    const doc = graph(4, ["AB", "BC", "CA", "CD"]);
    const m = cycles(doc);
    expect(labelsOf(doc, m.nodes)).toEqual(["A", "B", "C"]);
    expect(edgesOf(doc, m.edges)).toEqual(["AB", "AC", "BC"]);
  });

  test("undirected: a tree has none", () => {
    expect(cycles(graph(4, ["AB", "AC", "CD"])).nodes.size).toBe(0);
  });
});

test.describe("sources and sinks", () => {
  test("directed: no edges in, no edges out; a lone vertex is both", () => {
    const doc = graph(4, ["AB", "BC"], true);
    expect(labelsOf(doc, filterMatches(doc, ["sources"]).nodes)).toEqual(["A", "D"]);
    expect(labelsOf(doc, filterMatches(doc, ["sinks"]).nodes)).toEqual(["C", "D"]);
  });

  test("only apply to directed graphs", () => {
    const doc = graph(2, ["AB"]);
    expect(filterMatches(doc, ["sources", "sinks"]).nodes.size).toBe(0);
    expect(filterApplies("sources", false)).toBe(false);
    expect(filterApplies("cut-edges", false)).toBe(true);
    expect(filterApplies("sinks", true)).toBe(true);
  });
});

test.describe("back, forward and cross edges", () => {
  test("directed: sorted by the dfs discovery and finish times", () => {
    // dfs from A: A→B, B→C tree; C→A back to an ancestor; A→C forward to a descendant;
    // D is found last, D→A crosses to an already finished tree
    const doc = graph(4, ["AB", "BC", "CA", "AC", "DA"], true);
    const kinds = edgeKinds(doc);
    expect(edgesOf(doc, kinds.tree)).toEqual(["AB", "BC"]);
    expect(edgesOf(doc, filterMatches(doc, ["back-edges"]).edges)).toEqual(["CA"]);
    expect(edgesOf(doc, filterMatches(doc, ["forward-edges"]).edges)).toEqual(["AC"]);
    expect(edgesOf(doc, filterMatches(doc, ["cross-edges"]).edges)).toEqual(["DA"]);
  });

  test("a two-way pair: the way back is a back edge", () => {
    const doc = graph(2, ["AB", "BA"], true);
    expect(edgesOf(doc, edgeKinds(doc).back)).toEqual(["BA"]);
  });

  test("a cross edge between siblings in one tree", () => {
    // A→B and A→C are tree edges; C→B points at B, finished before C was found
    const doc = graph(3, ["AB", "AC", "CB"], true);
    expect(edgesOf(doc, edgeKinds(doc).cross)).toEqual(["CB"]);
  });

  test("Graph-12: 0→7 is a forward edge", () => {
    // labels 0–7, root 0; ids deliberately differ from labels as in the file
    const label = ["0", "1", "2", "4", "3", "5", "7", "6"];
    const nodes = label.map((l, i) => ({ id: String(i), label: l, x: 0, y: 0, color: "#a78bfa", isRoot: i === 0 }));
    const byLabel = (l: string) => String(label.indexOf(l));
    const pairs = ["01", "02", "24", "46", "47", "07", "35", "51", "43", "13"];
    const edges = pairs.map((p, i) => ({ id: `e${i}`, source: byLabel(p[0]), target: byLabel(p[1]), weight: 1, color: "#94a3b8" }));
    const doc: GraphDoc = { ...emptyGraph(), directed: true, indexMode: "zero", nodes, edges };
    const name = (ids: Set<string>) => [...ids].map((id) => pairs[Number(id.slice(1))]).sort();
    const kinds = edgeKinds(doc);
    expect(name(kinds.forward)).toEqual(["07"]);
    expect(name(kinds.back)).toEqual(["51"]);
    expect(name(kinds.cross)).toEqual(["43"]);
  });

  test("only apply to directed graphs", () => {
    const doc = graph(3, ["AB", "BC", "CA"]);
    expect(filterMatches(doc, ["back-edges", "forward-edges", "cross-edges"]).edges.size).toBe(0);
    for (const id of ["back-edges", "forward-edges", "cross-edges"] as const) {
      expect(filterApplies(id, false)).toBe(false);
      expect(filterApplies(id, true)).toBe(true);
    }
  });
});

test("several filters show the union of what each picks out", () => {
  const doc = graph(4, ["AB", "BC"], true);
  const m = filterMatches(doc, ["sources", "sinks", "cut-edges"]);
  expect(labelsOf(doc, m.nodes)).toEqual(["A", "C", "D"]);
  expect(edgesOf(doc, m.edges)).toEqual(["AB", "BC"]);
});

test.describe("editing lock", () => {
  test.beforeEach(() => {
    useEditorStore.getState().load(graph(2, ["AB"]));
    useEditorStore.getState().clearFilters();
  });
  test.afterEach(() => useEditorStore.getState().clearFilters());

  test("any filter blocks edits, undo and imports until all are off", () => {
    const s = useEditorStore.getState;
    s().commit((d) => addNode(d, { x: 9, y: 9 }));
    expect(s().doc.nodes).toHaveLength(3);

    s().toggleFilter("loops");
    const frozen = s().doc;
    s().commit((d) => addNode(d, { x: 0, y: 0 }));
    s().undo();
    s().replaceDoc(emptyGraph());
    expect(s().doc).toBe(frozen);

    s().toggleFilter("loops");
    s().undo();
    expect(s().doc.nodes).toHaveLength(2);
  });

  test("turning a filter on clears the selection", () => {
    const s = useEditorStore.getState;
    s().setSelection({ nodes: [s().doc.nodes[0].id], edges: [] });
    s().toggleFilter("cut-edges");
    expect(s().selection).toEqual({ nodes: [], edges: [] });
    expect(s().filters).toEqual(["cut-edges"]);
  });
});
