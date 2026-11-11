import { expect, test } from "@playwright/test";
import { addEdge, addNode, setWeight } from "../../src/domain/graph/ops";
import { emptyGraph, type GraphDoc } from "../../src/domain/graph/schema";
import { adjacencyList, adjacencyMatrix } from "../../src/domain/graph/views";

// nodes a, b, c with edges a-b (weight 5) and b-c
function sample(directed: boolean): GraphDoc {
  let doc: GraphDoc = { ...emptyGraph(), directed };
  for (let i = 0; i < 3; i++) doc = addNode(doc, { x: 0, y: 0 });
  const [a, b, c] = doc.nodes.map((n) => n.id);
  doc = addEdge(doc, a, b);
  doc = setWeight(doc, doc.edges[0].id, 5);
  return addEdge(doc, b, c);
}

test.describe("adjacencyMatrix", () => {
  test("is symmetric for undirected graphs", () => {
    const m = adjacencyMatrix(sample(false));
    expect(m.nodes.map((n) => n.label)).toEqual(["A", "B", "C"]);
    expect(m.cells).toEqual([
      [null, 5, null],
      [5, null, 1],
      [null, 1, null],
    ]);
  });

  test("follows direction for directed graphs", () => {
    const m = adjacencyMatrix(sample(true));
    expect(m.cells[0][1]).toBe(5);
    expect(m.cells[1][0]).toBeNull();
  });

  test("is empty for an empty graph", () => {
    expect(adjacencyMatrix(emptyGraph())).toEqual({ nodes: [], cells: [] });
  });
});

test.describe("adjacencyList", () => {
  const summary = (doc: GraphDoc) =>
    adjacencyList(doc).map((r) => [r.node.label, r.neighbors.map((n) => `${n.node.label}:${n.weight}`)]);

  test("lists both directions for undirected graphs", () => {
    expect(summary(sample(false))).toEqual([
      ["A", ["B:5"]],
      ["B", ["A:5", "C:1"]],
      ["C", ["B:1"]],
    ]);
  });

  test("lists only outgoing edges for directed graphs", () => {
    expect(summary(sample(true))).toEqual([
      ["A", ["B:5"]],
      ["B", ["C:1"]],
      ["C", []],
    ]);
  });
});