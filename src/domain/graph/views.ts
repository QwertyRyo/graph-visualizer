import { compareLabels, neighbors } from "./ops";
import { DEFAULT_EDGE_WEIGHT, type GraphDoc, type GraphNode } from "./schema";

export type AdjacencyMatrix = {
  nodes: GraphNode[];
  cells: (number | null)[][];
};

export type AdjacencyListRow = {
  node: GraphNode;
  neighbors: { node: GraphNode; weight: number }[];
};

function sortedNodes(doc: GraphDoc): GraphNode[] {
  return [...doc.nodes].sort((a, b) => compareLabels(a.label, b.label));
}

// undirected edges fill both cells, so the matrix is symmetric
export function adjacencyMatrix(doc: GraphDoc): AdjacencyMatrix {
  const nodes = sortedNodes(doc);
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const cells = nodes.map(() => nodes.map((): number | null => null));
  for (const e of doc.edges) {
    const i = index.get(e.source);
    const j = index.get(e.target);
    if (i === undefined || j === undefined) continue;
    cells[i][j] = e.weight;
    if (!doc.directed) cells[j][i] = e.weight;
  }
  return { nodes, cells };
}

export function adjacencyList(doc: GraphDoc): AdjacencyListRow[] {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const weight = new Map<string, number>();
  for (const e of doc.edges) {
    weight.set(`${e.source}|${e.target}`, e.weight);
    if (!doc.directed) weight.set(`${e.target}|${e.source}`, e.weight);
  }
  return sortedNodes(doc).map((node) => ({
    node,
    neighbors: neighbors(doc, node.id).map((id) => ({
      node: byId.get(id)!,
      weight: weight.get(`${node.id}|${id}`) ?? DEFAULT_EDGE_WEIGHT,
    })),
  }));
}
