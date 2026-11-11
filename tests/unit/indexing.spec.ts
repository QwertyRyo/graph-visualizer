import { expect, test } from "@playwright/test";
import { alignIds, autoLabel, detectIndexMode, labelIndex, nextId } from "../../src/domain/graph/indexing";
import { addNode, relabelNode, removeNode, setIndexMode } from "../../src/domain/graph/ops";
import { emptyGraph, parseGraphDoc, type GraphDoc } from "../../src/domain/graph/schema";

function withNodes(n: number, base: GraphDoc = emptyGraph()): GraphDoc {
  let doc = base;
  for (let i = 0; i < n; i++) doc = addNode(doc, { x: 0, y: 0 });
  return doc;
}

const labels = (doc: GraphDoc) => doc.nodes.map((n) => n.label);

test.describe("autoLabel", () => {
  test("names ids in each mode", () => {
    expect([0, 1, 2].map((i) => autoLabel(i, "zero"))).toEqual(["0", "1", "2"]);
    expect([0, 1, 2].map((i) => autoLabel(i, "one"))).toEqual(["1", "2", "3"]);
    expect([0, 1, 2].map((i) => autoLabel(i, "alpha"))).toEqual(["A", "B", "C"]);
  });

  test("letters run past Z like spreadsheet columns, the 27th vertex is AA", () => {
    expect(autoLabel(25, "alpha")).toBe("Z");
    expect(autoLabel(26, "alpha")).toBe("AA");
    expect(autoLabel(27, "alpha")).toBe("AB");
    expect(autoLabel(51, "alpha")).toBe("AZ");
    expect(autoLabel(52, "alpha")).toBe("BA");
    expect(autoLabel(99, "alpha")).toBe("CV");
  });

  test("labelIndex reads a default name back, custom names give null", () => {
    expect(labelIndex("AA", "alpha")).toBe(26);
    expect(labelIndex("0", "zero")).toBe(0);
    expect(labelIndex("1", "one")).toBe(0);
    expect(labelIndex("0", "one")).toBeNull();
    expect(labelIndex("Alice", "alpha")).toBeNull();
    expect(labelIndex("007", "zero")).toBeNull();
  });
});

test.describe("vertex ids", () => {
  test("are integers in creation order", () => {
    expect(withNodes(3).nodes.map((n) => n.id)).toEqual(["0", "1", "2"]);
  });

  test("reuse the smallest id freed by a delete", () => {
    let doc = withNodes(3);
    doc = removeNode(doc, "1");
    expect(nextId(doc.nodes, doc.indexMode)).toBe(1);
    doc = addNode(doc, { x: 0, y: 0 });
    expect(doc.nodes.at(-1)).toMatchObject({ id: "1", label: "B" });
  });

  test("skip an index whose default name a renamed vertex holds", () => {
    // vertex 0 renamed to B, so the next vertex can't be 1/B
    let doc = relabelNode(withNodes(1), "0", "B");
    doc = addNode(doc, { x: 0, y: 0 });
    expect(doc.nodes.at(-1)).toMatchObject({ id: "2", label: "C" });
  });

  test("old random ids become integers in list order, ignoring names, and edges follow", () => {
    const { nodes, edges } = alignIds(
      [
        { id: "xK2", label: "A" },
        { id: "p9q", label: "C" },
        { id: "r7w", label: "B" },
        { id: "z0z", label: "Alice" },
      ],
      [{ source: "r7w", target: "z0z" }],
    );
    expect(nodes.map((n) => `${n.id}:${n.label}`)).toEqual(["0:A", "1:C", "2:B", "3:Alice"]);
    expect(edges).toEqual([{ source: "2", target: "3" }]);
  });

  test("integer ids are kept even when they don't match the names", () => {
    const nodes = [
      { id: "2", label: "A" },
      { id: "0", label: "Bob" },
    ];
    expect(alignIds(nodes, []).nodes).toEqual(nodes);
  });

  test("parseGraphDoc renumbers an old draft", () => {
    const doc = parseGraphDoc({
      version: 1,
      directed: false,
      weighted: false,
      nodes: [
        { id: "abc", label: "A", x: 0, y: 0 },
        { id: "def", label: "B", x: 0, y: 0 },
      ],
      edges: [{ id: "e1", source: "abc", target: "def" }],
    });
    expect(doc.nodes.map((n) => n.id)).toEqual(["0", "1"]);
    expect(doc.edges[0]).toMatchObject({ source: "0", target: "1" });
    expect(doc.indexMode).toBe("alpha");
  });
});

test.describe("setIndexMode", () => {
  test("existing names stay, whatever the mode", () => {
    let doc = relabelNode(withNodes(3), "0", "Alice");
    for (const mode of ["zero", "one", "alpha"] as const) {
      doc = setIndexMode(doc, mode);
      expect(doc.indexMode).toBe(mode);
      expect(labels(doc)).toEqual(["Alice", "B", "C"]);
    }
  });

  test("only vertices added afterwards use the new mode", () => {
    let doc = setIndexMode(withNodes(3), "zero");
    doc = addNode(doc, { x: 0, y: 0 });
    expect(labels(doc)).toEqual(["A", "B", "C", "3"]);
    doc = addNode(setIndexMode(doc, "one"), { x: 0, y: 0 });
    expect(labels(doc)).toEqual(["A", "B", "C", "3", "5"]);
    doc = addNode(setIndexMode(doc, "alpha"), { x: 0, y: 0 });
    expect(labels(doc)).toEqual(["A", "B", "C", "3", "5", "F"]);
  });

  test("a new vertex never takes a name already in use", () => {
    // "1" is taken, so id 0 can't be named "1" in 1-indexed mode
    let doc = relabelNode(withNodes(2), "1", "1");
    doc = relabelNode(doc, "0", "X");
    doc = setIndexMode(doc, "one");
    doc = removeNode(doc, "0");
    doc = addNode(doc, { x: 0, y: 0 });
    expect(new Set(labels(doc)).size).toBe(doc.nodes.length);
    expect(() => parseGraphDoc(doc)).not.toThrow();
  });

  test("new vertices use the current mode", () => {
    const doc = withNodes(2, { ...emptyGraph(), indexMode: "one" });
    expect(labels(doc)).toEqual(["1", "2"]);
  });

  test("is a no-op for the current mode", () => {
    const doc = withNodes(2);
    expect(setIndexMode(doc, "alpha")).toBe(doc);
  });
});

test.describe("detectIndexMode", () => {
  test("finds the mode the labels follow", () => {
    const named = (labels: string[]) => labels.map((label, i) => ({ id: String(i), label }));
    expect(detectIndexMode(named(["0", "1", "2"]))).toBe("zero");
    expect(detectIndexMode(named(["1", "2", "3"]))).toBe("one");
    expect(detectIndexMode(named(["A", "B", "C"]))).toBe("alpha");
    expect(detectIndexMode(named(["Alice", "Bob"]))).toBe("alpha");
  });
});
