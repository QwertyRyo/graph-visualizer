import { expect, test } from "@playwright/test";
import { addEdge, addNode } from "../../src/domain/graph/ops";
import { addPreset, canAddPreset, PRESETS, presetOrigin } from "../../src/domain/graph/presets";
import { emptyGraph, MAX_NODES, parseGraphDoc, type GraphDoc } from "../../src/domain/graph/schema";

const line = PRESETS.find((p) => p.id === "path-3")!;

function twoNodes(): GraphDoc {
  let doc = addNode(emptyGraph(), { x: 0, y: 0 });
  doc = addNode(doc, { x: 50, y: 100 });
  return addEdge(doc, doc.nodes[0].id, doc.nodes[1].id);
}

test("line of 3 adds three vertices joined in a row", () => {
  const { doc, nodeIds } = addPreset(emptyGraph(), line, { x: 0, y: 0 });
  expect(nodeIds).toHaveLength(3);
  expect(doc.nodes.map((n) => n.label)).toEqual(["A", "B", "C"]);
  expect(doc.nodes.map((n) => n.y)).toEqual([0, 0, 0]);
  const pairs = doc.edges.map((e) => [e.source, e.target]);
  expect(pairs).toEqual([
    [nodeIds[0], nodeIds[1]],
    [nodeIds[1], nodeIds[2]],
  ]);
});

test("existing vertices and edges are kept untouched", () => {
  const before = twoNodes();
  const { doc } = addPreset(before, line, { x: 500, y: 0 });
  expect(doc.nodes.slice(0, 2)).toEqual(before.nodes);
  expect(doc.edges.slice(0, 1)).toEqual(before.edges);
  expect(doc.nodes).toHaveLength(5);
  expect(doc.edges).toHaveLength(3);
});

test("new vertices take the next free names and the result is a valid graph", () => {
  const { doc } = addPreset(twoNodes(), line, { x: 500, y: 0 });
  expect(doc.nodes.slice(2).map((n) => n.label)).toEqual(["C", "D", "E"]);
  expect(() => parseGraphDoc(doc)).not.toThrow();
});

test("the preset is centred on the origin", () => {
  const { doc } = addPreset(emptyGraph(), line, { x: 300, y: 40 });
  expect(doc.nodes.map((n) => ({ x: n.x, y: n.y }))).toEqual([
    { x: 200, y: 40 },
    { x: 300, y: 40 },
    { x: 400, y: 40 },
  ]);
});

test("presetOrigin puts the preset right of the graph, clear of it", () => {
  const doc = twoNodes();
  expect(presetOrigin(emptyGraph(), line)).toBeNull();
  const origin = presetOrigin(doc, line)!;
  const leftmost = origin.x + Math.min(...line.nodes.map((p) => p.x));
  expect(leftmost).toBeGreaterThan(Math.max(...doc.nodes.map((n) => n.x)));
  expect(origin.y).toBe(50);
});

test("a preset that would pass the vertex limit adds nothing", () => {
  let doc = emptyGraph();
  for (let i = 0; i < MAX_NODES - 1; i++) doc = addNode(doc, { x: i, y: 0 });
  expect(canAddPreset(doc, line)).toBe(false);
  const result = addPreset(doc, line, { x: 0, y: 0 });
  expect(result.doc).toBe(doc);
  expect(result.nodeIds).toEqual([]);
});

// adds a preset to an empty directed graph and returns edges as index pairs
function directedPairs(id: string) {
  const preset = PRESETS.find((p) => p.id === id)!;
  const { doc, nodeIds } = addPreset({ ...emptyGraph(), directed: true }, preset, { x: 0, y: 0 });
  const index = (nodeId: string) => nodeIds.indexOf(nodeId);
  return { doc, pairs: doc.edges.map((e) => [index(e.source), index(e.target)]) };
}

test("cycle of 6 runs 0 → 1 → … → 5 → 0", () => {
  const { doc, pairs } = directedPairs("cycle-6");
  expect(doc.nodes).toHaveLength(6);
  expect(pairs).toEqual([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]);
});

test("3-layer tree has 1, 2 and 4 vertices with edges pointing down", () => {
  const { doc, pairs } = directedPairs("tree-3");
  expect(doc.nodes).toHaveLength(7);
  expect(new Set(doc.nodes.map((n) => n.y)).size).toBe(3);
  expect(pairs).toEqual([[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]]);
});

test("fully connected joins every pair once, pointing at the earlier vertex", () => {
  const { doc, pairs } = directedPairs("complete-6");
  expect(doc.nodes).toHaveLength(6);
  expect(pairs).toHaveLength(15);
  expect(new Set(pairs.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`)).size).toBe(15);
  for (const [from, to] of pairs) expect(to).toBeLessThan(from);
});

test("3×3 grid joins neighbours only, pointing at the earlier vertex", () => {
  const { doc, pairs } = directedPairs("grid-3x3");
  expect(doc.nodes).toHaveLength(9);
  expect(pairs).toHaveLength(12);
  for (const [from, to] of pairs) {
    expect(to).toBeLessThan(from);
    expect([1, 3]).toContain(from - to);
  }
});

test("every preset makes a valid graph, directed or not, beside existing vertices", () => {
  for (const preset of PRESETS) {
    for (const directed of [false, true]) {
      const base = { ...twoNodes(), directed };
      const { doc } = addPreset(base, preset, presetOrigin(base, preset)!);
      expect(doc.nodes).toHaveLength(2 + preset.nodes.length);
      expect(doc.edges).toHaveLength(1 + preset.edges.length);
      expect(() => parseGraphDoc(doc)).not.toThrow();
    }
  }
});
