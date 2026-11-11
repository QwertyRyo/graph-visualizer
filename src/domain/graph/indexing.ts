import { excelColToInt, intToExcelCol } from "excel-column-name";

export const INDEX_MODES = ["zero", "one", "alpha"] as const;
export type IndexMode = (typeof INDEX_MODES)[number];

type Named = { id: string; label: string };

// vertex ids are integers kept as strings, cytoscape needs string ids
export const isIndexId = (id: string) => /^(0|[1-9]\d*)$/.test(id);

// the default name of the vertex with this id
export function autoLabel(id: number, mode: IndexMode): string {
  if (mode === "zero") return String(id);
  if (mode === "one") return String(id + 1);
  return intToExcelCol(id + 1);
}

// the index a default name stands for, or null for a custom name
// long names are custom, so numbers stay small and exact
export function labelIndex(label: string, mode: IndexMode): number | null {
  if (mode === "zero") return /^(0|[1-9]\d{0,5})$/.test(label) ? Number(label) : null;
  if (mode === "one") return /^[1-9]\d{0,5}$/.test(label) ? Number(label) - 1 : null;
  return /^[A-Z]{1,4}$/.test(label) ? excelColToInt(label) - 1 : null;
}

// smallest index whose id and default name are both free, so the two stay in step
export function nextId(nodes: readonly Named[], mode: IndexMode): number {
  const ids = new Set(nodes.map((n) => n.id));
  const labels = new Set(nodes.map((n) => n.label));
  let i = 0;
  while (ids.has(String(i)) || labels.has(autoLabel(i, mode))) i++;
  return i;
}

// the mode most labels follow, so imported files keep switching cleanly
// 1, 2, 3 reads as 1-indexed, a 0 among them makes it 0-indexed
export function detectIndexMode(nodes: readonly Named[]): IndexMode {
  let best: IndexMode = "alpha";
  let bestCount = 0;
  for (const mode of ["alpha", "one", "zero"] as const) {
    const count = nodes.filter((n) => labelIndex(n.label, mode) !== null).length;
    if (count > bestCount) [best, bestCount] = [mode, count];
  }
  return best;
}

// ids are independent of names: integer ids are kept, older random ids
// get the smallest free integer in list order; edges follow
export function alignIds<N extends Named, E extends { source: string; target: string }>(
  nodes: readonly N[],
  edges: readonly E[],
): { nodes: N[]; edges: E[] } {
  const newId = new Map<string, string>();
  const taken = new Set(nodes.filter((n) => isIndexId(n.id)).map((n) => n.id));
  let free = 0;
  for (const n of nodes) {
    if (isIndexId(n.id)) {
      newId.set(n.id, n.id);
    } else {
      while (taken.has(String(free))) free++;
      newId.set(n.id, String(free));
      taken.add(String(free));
    }
  }
  return {
    nodes: nodes.map((n) => ({ ...n, id: newId.get(n.id)! })),
    edges: edges.map((e) => ({ ...e, source: newId.get(e.source)!, target: newId.get(e.target)! })),
  };
}
