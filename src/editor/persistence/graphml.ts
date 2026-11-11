import { detectIndexMode } from "../../domain/graph/indexing";
import { addEdge } from "../../domain/graph/ops";
import {
  DEFAULT_EDGE_COLOR,
  DEFAULT_EDGE_WEIGHT,
  DEFAULT_NODE_COLOR,
  MAX_LABEL_LENGTH,
  parseGraphDoc,
  type GraphDoc,
} from "../../domain/graph/schema";
import { escapeXml, findAll, parseXml, XmlError, type XmlElement } from "./xml";

const KEYS = [
  { id: "g_title", for: "graph", name: "title", type: "string" },
  { id: "g_weighted", for: "graph", name: "weighted", type: "boolean" },
  { id: "v_label", for: "node", name: "label", type: "string" },
  { id: "v_x", for: "node", name: "x", type: "double" },
  { id: "v_y", for: "node", name: "y", type: "double" },
  { id: "v_color", for: "node", name: "color", type: "string" },
  { id: "v_root", for: "node", name: "isRoot", type: "boolean" },
  { id: "e_weight", for: "edge", name: "weight", type: "double" },
  { id: "e_color", for: "edge", name: "color", type: "string" },
];

const data = (key: string, value: string | number | boolean) =>
  `<data key="${key}">${escapeXml(String(value))}</data>`;

export function toGraphML(doc: GraphDoc, title: string): string {
  const index = new Map(doc.nodes.map((n, i) => [n.id, `n${i}`]));
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<graphml xmlns="http://graphml.graphdrawing.org/xmlns"`,
    `    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`,
    `    xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">`,
    ...KEYS.map((k) => `  <key id="${k.id}" for="${k.for}" attr.name="${k.name}" attr.type="${k.type}"/>`),
    `  <graph id="G" edgedefault="${doc.directed ? "directed" : "undirected"}">`,
    `    ${data("g_title", title)}`,
    `    ${data("g_weighted", doc.weighted)}`,
  ];
  for (const n of doc.nodes) {
    const parts = [data("v_label", n.label), data("v_x", n.x), data("v_y", n.y), data("v_color", n.color)];
    if (n.isRoot) parts.push(data("v_root", true));
    lines.push(`    <node id="${index.get(n.id)}">${parts.join("")}</node>`);
  }
  doc.edges.forEach((e, i) => {
    const parts = [data("e_weight", e.weight), data("e_color", e.color)];
    lines.push(`    <edge id="e${i}" source="${index.get(e.source)}" target="${index.get(e.target)}">${parts.join("")}</edge>`);
  });
  lines.push(`  </graph>`, `</graphml>`, ``);
  return lines.join("\n");
}

export class GraphMLImportError extends Error {}

type Key = { domain: string; name: string; fallback?: string };

const truthy = (v: string | undefined) => v !== undefined && /^(true|yes|1)$/i.test(v.trim());
const finite = (v: string | undefined) => {
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function hexColor(v: string | undefined): string | undefined {
  // yed writes #rrggbbaa, keep the rgb part
  const m = v && /^#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/.exec(v.trim());
  return m ? `#${m[1].toLowerCase()}` : undefined;
}

// gephi stores colors as separate r, g, b integers
function rgbColor(values: Record<string, string>): string | undefined {
  const parts = [values.r, values.g, values.b].map(finite);
  if (parts.some((p) => p === undefined || p < 0 || p > 255)) return undefined;
  return `#${parts.map((p) => Math.round(p!).toString(16).padStart(2, "0")).join("")}`;
}

// values by lowercased attribute name, key defaults first
function valuesOf(el: XmlElement, domain: string, keys: Map<string, Key>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys.values()) {
    if ((k.domain === domain || k.domain === "all") && k.fallback !== undefined) out[k.name] = k.fallback;
  }
  for (const d of el.children) {
    if (d.name !== "data") continue;
    const key = keys.get(d.attrs.key);
    if (key && d.children.length === 0) out[key.name] = d.text.trim();
  }
  return out;
}

// yed keeps label, position and color inside its own markup
function yedNode(el: XmlElement) {
  const own = el.children.filter((c) => c.name === "data");
  const first = (name: string) => own.flatMap((d) => findAll(d, name))[0];
  const geo = first("Geometry")?.attrs;
  const x = finite(geo?.x);
  const y = finite(geo?.y);
  const pos =
    x !== undefined && y !== undefined
      ? { x: x + (finite(geo?.width) ?? 0) / 2, y: y + (finite(geo?.height) ?? 0) / 2 }
      : undefined;
  return { label: first("NodeLabel")?.text.trim() || undefined, pos, color: hexColor(first("Fill")?.attrs.color) };
}

// labels must be unique and short, so trim and number repeats
function uniqueLabel(base: string, used: Set<string>): string {
  const clean = base.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH) || "v";
  let label = clean;
  for (let i = 2; used.has(label); i++) {
    const suffix = ` ${i}`;
    label = clean.slice(0, MAX_LABEL_LENGTH - suffix.length) + suffix;
  }
  used.add(label);
  return label;
}

// throws GraphMLImportError or a validation error
export function fromGraphML(text: string): { doc: GraphDoc; title?: string } {
  let root: XmlElement;
  try {
    root = parseXml(text);
  } catch (err) {
    throw new GraphMLImportError(err instanceof XmlError ? err.message : "Not valid XML");
  }
  if (root.name !== "graphml") throw new GraphMLImportError("Not a GraphML file");
  const graph = root.children.find((c) => c.name === "graph");
  if (!graph) throw new GraphMLImportError("No graph in this file");

  const keys = new Map<string, Key>();
  for (const k of root.children.filter((c) => c.name === "key")) {
    const fallback = k.children.find((c) => c.name === "default")?.text.trim();
    keys.set(k.attrs.id, { domain: k.attrs.for ?? "all", name: (k.attrs["attr.name"] ?? k.attrs.id).toLowerCase(), fallback });
  }

  const g = valuesOf(graph, "graph", keys);
  const used = new Set<string>();
  const idOf = new Map<string, string>();
  let unplaced = 0;
  const nodes = findAll(graph, "node").map((el, i) => {
    const v = valuesOf(el, "node", keys);
    const yed = yedNode(el);
    const id = String(i);
    idOf.set(el.attrs.id, id);
    const x = finite(v.x);
    const y = finite(v.y);
    const pos =
      x !== undefined && y !== undefined
        ? { x, y }
        : (yed.pos ?? { x: 100 + (unplaced % 10) * 100, y: 100 + Math.floor(unplaced++ / 10) * 100 });
    return {
      id,
      label: uniqueLabel(v.label || v.name || yed.label || el.attrs.id, used),
      ...pos,
      color: hexColor(v.color) ?? rgbColor(v) ?? yed.color ?? DEFAULT_NODE_COLOR,
      isRoot: truthy(v.isroot ?? v.root),
    };
  });
  let rootSeen = false;
  for (const n of nodes) {
    if (n.isRoot && rootSeen) n.isRoot = false;
    rootSeen ||= n.isRoot;
  }

  const edgeEls = findAll(graph, "edge");
  const fallbackDirected = graph.attrs.edgedefault === "directed";
  const directed = edgeEls.some((e) => (e.attrs.directed ? truthy(e.attrs.directed) : fallbackDirected));
  const weights = edgeEls.map((e) => finite(valuesOf(e, "edge", keys).weight));
  const weighted = g.weighted !== undefined ? truthy(g.weighted) : weights.some((w) => w !== undefined);

  let doc: GraphDoc = { version: 1, directed, weighted, indexMode: detectIndexMode(nodes), nodes, edges: [] };
  edgeEls.forEach((el, i) => {
    const source = idOf.get(el.attrs.source);
    const target = idOf.get(el.attrs.target);
    if (!source || !target) return;
    const next = addEdge(doc, source, target);
    if (next === doc) return;
    const added = next.edges.at(-1)!;
    const v = valuesOf(el, "edge", keys);
    const line = el.children.filter((c) => c.name === "data").flatMap((d) => findAll(d, "LineStyle"))[0];
    added.weight = weights[i] ?? DEFAULT_EDGE_WEIGHT;
    added.color = hexColor(v.color) ?? rgbColor(v) ?? hexColor(line?.attrs.color) ?? DEFAULT_EDGE_COLOR;
    doc = next;
  });

  const title = (g.title || g.name || graph.attrs.id || "").trim();
  return { doc: parseGraphDoc(doc), title: title || undefined };
}
