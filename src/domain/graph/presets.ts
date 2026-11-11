import { addEdge, addNode } from "./ops";
import { MAX_NODES, type GraphDoc } from "./schema";

type Point = { x: number; y: number };

export type Preset = {
  id: string;
  label: string;
  nodes: readonly Point[];
  edges: readonly (readonly [number, number])[];
};

const SPACING = 100;

type Edge = readonly [number, number];

// n points on a circle, starting at the top and going clockwise
function ring(n: number, radius: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: Math.round(radius * Math.cos(angle)), y: Math.round(radius * Math.sin(angle)) };
  });
}

// every pair joined once, each edge pointing from the later vertex to the earlier
function allPairs(n: number): Edge[] {
  const edges: Edge[] = [];
  for (let later = 1; later < n; later++) {
    for (let earlier = 0; earlier < later; earlier++) edges.push([later, earlier]);
  }
  return edges;
}

// rows of vertices left to right, top to bottom
function grid(rows: number, cols: number): Preset["nodes"] {
  const nodes: Point[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({ x: (c - (cols - 1) / 2) * SPACING, y: (r - (rows - 1) / 2) * SPACING });
    }
  }
  return nodes;
}

// each vertex joined to its right and lower neighbours, pointing back at the earlier one
function gridEdges(rows: number, cols: number): Edge[] {
  const edges: Edge[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c + 1 < cols) edges.push([i + 1, i]);
      if (r + 1 < rows) edges.push([i + cols, i]);
    }
  }
  return edges;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "path-3",
    label: "Line of 3",
    nodes: [
      { x: -SPACING, y: 0 },
      { x: 0, y: 0 },
      { x: SPACING, y: 0 },
    ],
    edges: [
      [0, 1],
      [1, 2],
    ],
  },
  {
    id: "cycle-6",
    label: "Cycle of 6",
    nodes: ring(6, 120),
    edges: Array.from({ length: 6 }, (_, i): Edge => [i, (i + 1) % 6]),
  },
  {
    id: "tree-3",
    label: "3-layer tree",
    nodes: [
      { x: 0, y: -SPACING },
      { x: -SPACING, y: 0 },
      { x: SPACING, y: 0 },
      { x: -1.5 * SPACING, y: SPACING },
      { x: -0.5 * SPACING, y: SPACING },
      { x: 0.5 * SPACING, y: SPACING },
      { x: 1.5 * SPACING, y: SPACING },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 3],
      [1, 4],
      [2, 5],
      [2, 6],
    ],
  },
  {
    id: "complete-6",
    label: "Fully connected (6)",
    nodes: ring(6, 130),
    edges: allPairs(6),
  },
  {
    id: "grid-3x3",
    label: "3×3 grid",
    nodes: grid(3, 3),
    edges: gridEdges(3, 3),
  },
];

const GAP = 150;

// where to centre a preset so it sits right of the existing graph, null when empty
export function presetOrigin(doc: GraphDoc, preset: Preset): Point | null {
  if (doc.nodes.length === 0) return null;
  const xs = doc.nodes.map((n) => n.x);
  const ys = doc.nodes.map((n) => n.y);
  const left = Math.min(...preset.nodes.map((p) => p.x));
  return {
    x: Math.max(...xs) + GAP - left,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

export function canAddPreset(doc: GraphDoc, preset: Preset): boolean {
  return doc.nodes.length + preset.nodes.length <= MAX_NODES;
}

// adds the preset beside what's there, existing vertices and edges untouched.
// new vertices take the next free ids and names, like hand-placed ones
export function addPreset(doc: GraphDoc, preset: Preset, origin: Point): { doc: GraphDoc; nodeIds: string[] } {
  if (!canAddPreset(doc, preset)) return { doc, nodeIds: [] };
  let next = doc;
  const nodeIds: string[] = [];
  for (const p of preset.nodes) {
    next = addNode(next, { x: origin.x + p.x, y: origin.y + p.y });
    nodeIds.push(next.nodes[next.nodes.length - 1].id);
  }
  for (const [a, b] of preset.edges) next = addEdge(next, nodeIds[a], nodeIds[b]);
  return { doc: next, nodeIds };
}
