import { expect, test } from "@playwright/test";
import {
  DEFAULT_EDGE_COLOR,
  DEFAULT_NODE_COLOR,
  emptyGraph,
  MAX_NODES,
  parseGraphDoc,
  type GraphDoc,
} from "../../src/domain/graph/schema";
import {
  addEdge,
  addNode,
  moveNode,
  moveNodes,
  neighbors,
  reconnectEdge,
  reverseEdge,
  relabelNode,
  removeEdge,
  removeNode,
  setDirected,
  setWeight,
  setWeighted,
  setColor,
  setRoot,
  rootId,
  labelError,
} from "../../src/domain/graph/ops";

// build a graph with n nodes and return it with their ids
function withNodes(n: number, base: GraphDoc = emptyGraph()) {
  let doc = base;
  for (let i = 0; i < n; i++) doc = addNode(doc, { x: i, y: i });
  return { doc, ids: doc.nodes.map((node) => node.id) };
}

test.describe("addNode", () => {
  test("adds a node at the position with label A", () => {
    const doc = addNode(emptyGraph(), { x: 5, y: 7 });
    expect(doc.nodes).toHaveLength(1);
    expect(doc.nodes[0]).toMatchObject({ label: "A", x: 5, y: 7 });
  });

  test("does not mutate input", () => {
    const before = emptyGraph();
    addNode(before, { x: 0, y: 0 });
    expect(before.nodes).toHaveLength(0);
  });


  test("labels A to Z then AA, AB", () => {
    const { doc } = withNodes(28);
    const labels = doc.nodes.map((n) => n.label);
    expect(labels[0]).toBe("A");
    expect(labels[25]).toBe("Z");
    expect(labels[26]).toBe("AA");
    expect(labels[27]).toBe("AB");
  });

  test("reuses a freed label without duplicating", () => {
    const { doc, ids } = withNodes(3);
    const next = addNode(removeNode(doc, ids[0]), { x: 0, y: 0 });
    const labels = next.nodes.map((n) => n.label).sort();
    expect(labels).toEqual(["A", "B", "C"]);
  });

  test("ignores adds past the node limit", () => {
    const { doc } = withNodes(MAX_NODES);
    expect(addNode(doc, { x: 0, y: 0 })).toBe(doc);
  });

  test("produces a valid graph", () => {
    const { doc } = withNodes(3);
    expect(() => parseGraphDoc(doc)).not.toThrow();
  });
});

test.describe("moveNode and relabelNode", () => {
  test("moves a node", () => {
    const { doc, ids } = withNodes(1);
    const moved = moveNode(doc, ids[0], { x: 40, y: 50 });
    expect(moved.nodes[0]).toMatchObject({ x: 40, y: 50 });
    expect(doc.nodes[0]).toMatchObject({ x: 0, y: 0 });
  });

  test("moves several nodes at once", () => {
    const { doc, ids } = withNodes(3);
    const moved = moveNodes(doc, { [ids[0]]: { x: 10, y: 10 }, [ids[2]]: { x: 30, y: 30 } });
    expect(moved.nodes.map((n) => [n.x, n.y])).toEqual([[10, 10], [1, 1], [30, 30]]);
  });

  test("returns the same doc when nothing moved", () => {
    const { doc, ids } = withNodes(2);
    expect(moveNodes(doc, { [ids[0]]: { x: 0, y: 0 }, [ids[1]]: { x: 1, y: 1 } })).toBe(doc);
  });

  test("relabels a node", () => {
    const { doc, ids } = withNodes(1);
    expect(relabelNode(doc, ids[0], "Start").nodes[0].label).toBe("Start");
  });
});

test.describe("removeNode", () => {
  test("removes the node and its connected edges", () => {
    const { doc, ids } = withNodes(3);
    let g = addEdge(doc, ids[0], ids[1]);
    g = addEdge(g, ids[1], ids[2]);
    g = addEdge(g, ids[0], ids[2]);
    const after = removeNode(g, ids[1]);
    expect(after.nodes.map((n) => n.id)).toEqual([ids[0], ids[2]]);
    expect(after.edges).toHaveLength(1);
    expect(() => parseGraphDoc(after)).not.toThrow();
  });

});

test.describe("addEdge", () => {
  test("adds an edge with weight 1", () => {
    const { doc, ids } = withNodes(2);
    const g = addEdge(doc, ids[0], ids[1]);
    expect(g.edges[0]).toMatchObject({ source: ids[0], target: ids[1], weight: 1 });
  });

  test("stores undirected edges from low label to high label", () => {
    const { doc, ids } = withNodes(2);
    const g = addEdge(doc, ids[1], ids[0]);
    expect(g.edges[0]).toMatchObject({ source: ids[0], target: ids[1] });
  });

  test("keeps the drawn direction when directed", () => {
    const { doc, ids } = withNodes(2, { ...emptyGraph(), directed: true });
    const g = addEdge(doc, ids[1], ids[0]);
    expect(g.edges[0]).toMatchObject({ source: ids[1], target: ids[0] });
  });

  test("refuses self-edges", () => {
    const { doc, ids } = withNodes(1);
    expect(addEdge(doc, ids[0], ids[0])).toBe(doc);
  });

  test("schema rejects self-edges", () => {
    const { doc, ids } = withNodes(1);
    const bad = { ...doc, edges: [{ id: "e", source: ids[0], target: ids[0], weight: 0, color: DEFAULT_EDGE_COLOR }] };
    expect(() => parseGraphDoc(bad)).toThrow();
  });

  test("ignores exact duplicates", () => {
    const { doc, ids } = withNodes(2);
    const g = addEdge(doc, ids[0], ids[1]);
    expect(addEdge(g, ids[0], ids[1])).toBe(g);
  });

  test("treats u-v and v-u as the same when undirected", () => {
    const { doc, ids } = withNodes(2);
    const g = addEdge(doc, ids[0], ids[1]);
    expect(addEdge(g, ids[1], ids[0])).toBe(g);
  });

  test("allows both directions when directed", () => {
    const { doc, ids } = withNodes(2, { ...emptyGraph(), directed: true });
    let g = addEdge(doc, ids[0], ids[1]);
    g = addEdge(g, ids[1], ids[0]);
    expect(g.edges).toHaveLength(2);
  });

  test("ignores edges to missing nodes", () => {
    const { doc, ids } = withNodes(1);
    expect(addEdge(doc, ids[0], "nope")).toBe(doc);
  });
});

test.describe("removeEdge and setWeight", () => {
  test("removes an edge by id", () => {
    const { doc, ids } = withNodes(2);
    const g = addEdge(doc, ids[0], ids[1]);
    expect(removeEdge(g, g.edges[0].id).edges).toHaveLength(0);
  });

  test("sets an edge weight", () => {
    const { doc, ids } = withNodes(2);
    const g = addEdge(doc, ids[0], ids[1]);
    expect(setWeight(g, g.edges[0].id, 7).edges[0].weight).toBe(7);
  });
});

test.describe("reconnectEdge", () => {
  // a -> b with weight 4, plus a spare vertex c
  function setup(directed: boolean) {
    const { doc, ids } = withNodes(3, { ...emptyGraph(), directed });
    let g = addEdge(doc, ids[0], ids[1]);
    g = setWeight(g, g.edges[0].id, 4);
    return { g, ids, id: g.edges[0].id };
  }

  test("moves the target and keeps id and weight", () => {
    const { g, ids, id } = setup(true);
    expect(reconnectEdge(g, id, "target", ids[2]).edges).toEqual([
      { id, source: ids[0], target: ids[2], weight: 4, color: DEFAULT_EDGE_COLOR },
    ]);
  });

  test("moves the source", () => {
    const { g, ids, id } = setup(true);
    expect(reconnectEdge(g, id, "source", ids[2]).edges[0]).toMatchObject({ source: ids[2], target: ids[1] });
  });

  test("keeps undirected edges low to high", () => {
    const { g, ids, id } = setup(false);
    expect(reconnectEdge(g, id, "source", ids[2]).edges[0]).toMatchObject({ source: ids[1], target: ids[2] });
  });

  test("refuses self-edges, duplicates and no-ops", () => {
    const { g, ids, id } = setup(false);
    const withBC = addEdge(g, ids[1], ids[2]);
    expect(reconnectEdge(g, id, "target", ids[0])).toBe(g);
    expect(reconnectEdge(g, id, "target", ids[1])).toBe(g);
    expect(reconnectEdge(g, id, "target", "missing")).toBe(g);
    expect(reconnectEdge(withBC, id, "source", ids[2])).toBe(withBC);
  });

  test("allows the reverse of an existing edge when directed", () => {
    const { g, ids, id } = setup(true);
    const withCB = addEdge(g, ids[2], ids[0]);
    expect(reconnectEdge(withCB, id, "target", ids[2])).not.toBe(withCB);
  });
});

test.describe("reverseEdge", () => {
  test("flips a directed edge and keeps id and weight", () => {
    const { doc, ids } = withNodes(2, { ...emptyGraph(), directed: true });
    let g = addEdge(doc, ids[0], ids[1]);
    const id = g.edges[0].id;
    g = setWeight(g, id, 4);
    expect(reverseEdge(g, id).edges).toEqual([
      { id, source: ids[1], target: ids[0], weight: 4, color: DEFAULT_EDGE_COLOR },
    ]);
  });

  test("refuses when the opposite edge exists", () => {
    const { doc, ids } = withNodes(2, { ...emptyGraph(), directed: true });
    const g = addEdge(addEdge(doc, ids[0], ids[1]), ids[1], ids[0]);
    expect(reverseEdge(g, g.edges[0].id)).toBe(g);
  });

  test("leaves undirected edges and unknown ids alone", () => {
    const { doc, ids } = withNodes(2);
    const g = addEdge(doc, ids[0], ids[1]);
    expect(reverseEdge(g, g.edges[0].id)).toBe(g);
    expect(reverseEdge(g, "missing")).toBe(g);
  });
});

test.describe("setDirected", () => {
  test("merges u to v and v to u when going undirected", () => {
    const { doc, ids } = withNodes(2, { ...emptyGraph(), directed: true });
    let g = addEdge(doc, ids[0], ids[1]);
    g = addEdge(g, ids[1], ids[0]);
    const undirected = setDirected(g, false);
    expect(undirected.directed).toBe(false);
    expect(undirected.edges).toHaveLength(1);
  });

  test("keeps distinct edges when going undirected", () => {
    const { doc, ids } = withNodes(3, { ...emptyGraph(), directed: true });
    let g = addEdge(doc, ids[0], ids[1]);
    g = addEdge(g, ids[1], ids[2]);
    expect(setDirected(g, false).edges).toHaveLength(2);
  });

  test("keeps all edges when going directed", () => {
    const { doc, ids } = withNodes(2);
    const g = addEdge(doc, ids[0], ids[1]);
    const directed = setDirected(g, true);
    expect(directed.directed).toBe(true);
    expect(directed.edges).toHaveLength(1);
  });

  test("orients edges low label to high label when going directed", () => {
    const { doc, ids } = withNodes(2);
    const flipped = {
      ...addEdge(doc, ids[0], ids[1]),
    };
    flipped.edges = [{ ...flipped.edges[0], source: ids[1], target: ids[0] }];
    const g = setDirected(flipped, true);
    expect(g.edges[0]).toMatchObject({ source: ids[0], target: ids[1] });
  });

  test("setweighted or setdirected should not change anything", () => {
    const doc = emptyGraph();
    expect(setDirected(doc, false)).toBe(doc);
    expect(setWeighted(doc, false)).toBe(doc);
  });


  
});

test.describe("neighbors", () => {
  test("sorts neighbors by label", () => {
    const { doc, ids } = withNodes(4);
    let g = addEdge(doc, ids[0], ids[3]);
    g = addEdge(g, ids[0], ids[1]);
    g = addEdge(g, ids[2], ids[0]);
    expect(neighbors(g, ids[0])).toEqual([ids[1], ids[2], ids[3]]);
  });

  test("orders AA after Z", () => {
    const { doc, ids } = withNodes(27);
    const g = addEdge(addEdge(doc, ids[0], ids[26]), ids[0], ids[25]);
    expect(neighbors(g, ids[0])).toEqual([ids[25], ids[26]]);
  });

  test("follows edge direction when directed", () => {
    const { doc, ids } = withNodes(2, { ...emptyGraph(), directed: true });
    const g = addEdge(doc, ids[0], ids[1]);
    expect(neighbors(g, ids[0])).toEqual([ids[1]]);
    expect(neighbors(g, ids[1])).toEqual([]);
  });
});

test.describe("colors", () => {
  test("gives new nodes and edges default colors", () => {
    const { doc, ids } = withNodes(2);
    const g = addEdge(doc, ids[0], ids[1]);
    expect(g.nodes[0].color).toBe(DEFAULT_NODE_COLOR);
    expect(g.edges[0].color).toBe(DEFAULT_EDGE_COLOR);
  });

  test("colors only the given nodes and edges", () => {
    const { doc, ids } = withNodes(2);
    const g = addEdge(doc, ids[0], ids[1]);
    const red = setColor(g, { nodes: [ids[0]], edges: [g.edges[0].id] }, "#ff0000");
    expect(red.nodes.map((n) => n.color)).toEqual(["#ff0000", DEFAULT_NODE_COLOR]);
    expect(red.edges[0].color).toBe("#ff0000");
  });

  test("returns the same doc when nothing is given", () => {
    const { doc } = withNodes(1);
    expect(setColor(doc, { nodes: [], edges: [] }, "#ff0000")).toBe(doc);
  });

  test("fills in colors for files saved before colors existed", () => {
    const old = {
      version: 1, directed: false, weighted: false,
      nodes: [{ id: "a", label: "A", x: 0, y: 0 }, { id: "b", label: "B", x: 0, y: 0 }],
      edges: [{ id: "e", source: "a", target: "b", weight: 1 }],
    };
    const doc = parseGraphDoc(old);
    expect(doc.nodes[0].color).toBe(DEFAULT_NODE_COLOR);
    expect(doc.edges[0].color).toBe(DEFAULT_EDGE_COLOR);
  });

  test("rejects colors that are not #rrggbb", () => {
    const { doc } = withNodes(1);
    const bad = setColor(doc, { nodes: [doc.nodes[0].id], edges: [] }, "red");
    expect(() => parseGraphDoc(bad)).toThrow();
  });
});

test.describe("root node", () => {
  test("new nodes are not roots and the graph has no root", () => {
    const { doc } = withNodes(2);
    expect(doc.nodes.every((n) => !n.isRoot)).toBe(true);
    expect(rootId(doc)).toBeNull();
  });

  test("sets a root", () => {
    const { doc, ids } = withNodes(3);
    const g = setRoot(doc, ids[1], true);
    expect(rootId(g)).toBe(ids[1]);
    expect(doc.nodes[1].isRoot).toBe(false);
  });

  test("moving the root clears the old one", () => {
    const { doc, ids } = withNodes(3);
    const g = setRoot(setRoot(doc, ids[0], true), ids[2], true);
    expect(g.nodes.map((n) => n.isRoot)).toEqual([false, false, true]);
  });

  test("unsets the root", () => {
    const { doc, ids } = withNodes(2);
    const g = setRoot(setRoot(doc, ids[0], true), ids[0], false);
    expect(rootId(g)).toBeNull();
  });

  test("returns the same doc when nothing changes", () => {
    const { doc, ids } = withNodes(2);
    expect(setRoot(doc, ids[0], false)).toBe(doc);
    expect(setRoot(doc, "nope", true)).toBe(doc);
    const g = setRoot(doc, ids[0], true);
    expect(setRoot(g, ids[0], true)).toBe(g);
  });

  test("is dropped with its node", () => {
    const { doc, ids } = withNodes(2);
    expect(rootId(removeNode(setRoot(doc, ids[0], true), ids[0]))).toBeNull();
  });

  test("files saved before roots existed have no root", () => {
    const doc = parseGraphDoc({
      version: 1, directed: false, weighted: false,
      nodes: [{ id: "a", label: "A", x: 0, y: 0 }], edges: [],
    });
    expect(doc.nodes[0].isRoot).toBe(false);
  });

  test("rejects more than one root", () => {
    const { doc } = withNodes(2);
    const bad = { ...doc, nodes: doc.nodes.map((n) => ({ ...n, isRoot: true })) };
    expect(() => parseGraphDoc(bad)).toThrow();
  });
});

test.describe("vertex names", () => {
  test("allows a unique name up to 20 characters", () => {
    const { doc, ids } = withNodes(2);
    const name = "x".repeat(20);
    expect(labelError(doc, ids[0], name)).toBeNull();
    expect(relabelNode(doc, ids[0], name).nodes[0].label).toBe(name);
  });

  test("rejects names longer than 20 characters", () => {
    const { doc, ids } = withNodes(1);
    expect(labelError(doc, ids[0], "x".repeat(21))).toMatch(/at most 20/);
    expect(relabelNode(doc, ids[0], "x".repeat(21))).toBe(doc);
  });

  test("rejects a name another vertex already has", () => {
    const { doc, ids } = withNodes(2);
    expect(labelError(doc, ids[0], "B")).toMatch(/already named "B"/);
    expect(relabelNode(doc, ids[0], "B")).toBe(doc);
  });

  test("allows keeping a vertex's own name", () => {
    const { doc, ids } = withNodes(2);
    expect(labelError(doc, ids[0], "A")).toBeNull();
    expect(relabelNode(doc, ids[0], "A")).toBe(doc);
  });

  test("rejects empty names", () => {
    const { doc, ids } = withNodes(1);
    expect(labelError(doc, ids[0], "")).not.toBeNull();
  });

  test("schema rejects long or duplicate names", () => {
    const { doc } = withNodes(2);
    const long = { ...doc, nodes: [{ ...doc.nodes[0], label: "x".repeat(21) }, doc.nodes[1]] };
    const dup = { ...doc, nodes: doc.nodes.map((n) => ({ ...n, label: "same" })) };
    expect(() => parseGraphDoc(long)).toThrow();
    expect(() => parseGraphDoc(dup)).toThrow();
  });
});
