import { expect, test } from "@playwright/test";
import { addEdge, addNode, relabelNode, setColor, setRoot, setWeight } from "../../src/domain/graph/ops";
import { emptyGraph, type GraphDoc } from "../../src/domain/graph/schema";
import { fromDot, toDot } from "../../src/editor/persistence/dot";

// strips ids so docs with fresh ids can be compared
const shape = (doc: GraphDoc) => {
  const label = new Map(doc.nodes.map((n) => [n.id, n.label]));
  return {
    ...doc,
    nodes: doc.nodes.map((n) => ({ ...n, id: undefined })),
    edges: doc.edges.map((e) => ({ ...e, id: undefined, source: label.get(e.source), target: label.get(e.target) })),
  };
};

function sample(directed: boolean, weighted: boolean): GraphDoc {
  let doc: GraphDoc = { ...emptyGraph(), directed, weighted };
  doc = addNode(doc, { x: 10, y: 20 });
  doc = addNode(doc, { x: 30.5, y: -40 });
  doc = addNode(doc, { x: 0, y: 0 });
  const [a, b, c] = doc.nodes.map((n) => n.id);
  doc = relabelNode(doc, c, 'say "hi" \\ node');
  doc = setRoot(doc, b, true);
  doc = setColor(doc, { nodes: [a], edges: [] }, "#f87171");
  doc = addEdge(doc, a, b);
  doc = setWeight(doc, doc.edges[0].id, -2.5);
  doc = addEdge(doc, c, a);
  return setColor(doc, { nodes: [], edges: [doc.edges[1].id] }, "#60a5fa");
}

test.describe("toDot", () => {
  test("writes an undirected graph", () => {
    const text = toDot(sample(false, false), "My graph");
    expect(text).toContain('graph "My graph" {');
    expect(text).toContain('"A" [pos="10,-20!", fillcolor="#f87171"]');
    expect(text).toContain('"B" [pos="30.5,40!", fillcolor="#fb923c", root=true]');
    expect(text).toContain('"A" -- "B" [color="#94a3b8"]');
    expect(text).not.toContain("weight");
  });

  test("writes direction and weights", () => {
    const text = toDot(sample(true, true), "g");
    expect(text).toMatch(/^digraph "g" \{\n {2}weighted=true/);
    expect(text).toContain('"A" -> "B" [edge_weight=-2.5, label="-2.5", color="#94a3b8"]');
    expect(text).not.toMatch(/[^_]weight=/);
  });

  test("escapes quotes and backslashes", () => {
    expect(toDot(sample(false, false), 'a "b"')).toContain('"say \\"hi\\" \\\\ node"');
  });
});

test.describe("fromDot", () => {
  for (const [directed, weighted] of [
    [false, false],
    [true, true],
    [false, true],
  ]) {
    test(`round trips directed=${directed} weighted=${weighted}`, () => {
      const doc = sample(directed, weighted);
      const back = fromDot(toDot(doc, "Title"));
      expect(back.title).toBe("Title");
      const expected = weighted ? doc : { ...doc, edges: doc.edges.map((e) => ({ ...e, weight: 1 })) };
      expect(shape(back.doc)).toEqual(shape(expected));
    });
  }

  test("reads hand written dot", () => {
    const { doc, title } = fromDot(`
      /* a comment */
      strict digraph G {
        # shell comment
        node [fillcolor="#4ade80"]; // trailing comment
        rankdir=LR
        a -> b -> {c d} [weight=3];
        a:n -> e
        subgraph cluster_x { node [fillcolor="#000000"]; f }
        g [fillcolor="#ffffff"]
        a -> a
        "long" + "name"
      }`);
    expect(title).toBe("G");
    expect(doc.directed).toBe(true);
    expect(doc.weighted).toBe(true);
    expect(doc.nodes.map((n) => n.label)).toEqual(["a", "b", "c", "d", "e", "f", "g", "longname"]);
    expect(doc.nodes.find((n) => n.label === "a")!.color).toBe("#4ade80");
    expect(doc.nodes.find((n) => n.label === "f")!.color).toBe("#000000");
    expect(doc.nodes.find((n) => n.label === "g")!.color).toBe("#ffffff");
    const label = new Map(doc.nodes.map((n) => [n.id, n.label]));
    expect(doc.edges.map((e) => `${label.get(e.source)}>${label.get(e.target)}:${e.weight}`)).toEqual([
      "a>b:3",
      "b>c:3",
      "b>d:3",
      "a>e:1",
    ]);
  });

  test("uses the graph root attribute", () => {
    const { doc } = fromDot("graph { root=b; a -- b }");
    expect(doc.nodes.map((n) => n.isRoot)).toEqual([false, true]);
    expect(doc.weighted).toBe(false);
  });

  test("rejects text that isn't dot", () => {
    expect(() => fromDot("hello world")).toThrow();
    expect(() => fromDot("graph { a -- b")).toThrow();
    expect(() => fromDot("graph { a [color=]; }")).toThrow();
  });
});
