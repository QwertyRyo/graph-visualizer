import { addEdge } from "../../domain/graph/ops";
import { DEFAULT_EDGE_COLOR, DEFAULT_EDGE_WEIGHT, DEFAULT_NODE_COLOR, parseGraphDoc, type GraphDoc } from "../../domain/graph/schema";
import { detectIndexMode } from "../../domain/graph/indexing";

// ---------- writing ----------

const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const num = (n: number) => String(Math.round(n * 100) / 100);
const attrs = (pairs: [string, string][]) => `[${pairs.map(([k, v]) => `${k}=${v}`).join(", ")}]`;

// writes graphviz dot, vertices are named by their unique labels
export function toDot(doc: GraphDoc, title: string): string {
  const label = new Map(doc.nodes.map((n) => [n.id, quote(n.label)]));
  const op = doc.directed ? "->" : "--";
  const lines = [`${doc.directed ? "digraph" : "graph"} ${quote(title)} {`];
  if (doc.weighted) lines.push("  weighted=true");
  lines.push("  node [shape=circle, style=filled]");
  for (const n of doc.nodes) {
    const pairs: [string, string][] = [["pos", quote(`${num(n.x)},${num(-n.y)}!`)], ["fillcolor", quote(n.color)]];
    if (n.isRoot) pairs.push(["root", "true"]);
    lines.push(`  ${label.get(n.id)} ${attrs(pairs)}`);
  }
  for (const e of doc.edges) {
    const pairs: [string, string][] = [];
    if (doc.weighted) pairs.push(["edge_weight", num(e.weight)], ["label", quote(num(e.weight))]);
    pairs.push(["color", quote(e.color)]);
    lines.push(`  ${label.get(e.source)} ${op} ${label.get(e.target)} ${attrs(pairs)}`);
  }
  lines.push("}", "");
  return lines.join("\n");
}

type Token = { kind: "id" | "punct" | "edgeop"; text: string };
type Attrs = Record<string, string>;

// splits dot text into ids, punctuation and edge operators
function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c) || c === "﻿") i++;
    else if (src.startsWith("//", i) || c === "#") i = skipTo(src, i, "\n");
    else if (src.startsWith("/*", i)) i = skipTo(src, i, "*/") + 2;
    else if (src.startsWith("--", i) || src.startsWith("->", i)) {
      out.push({ kind: "edgeop", text: src.slice(i, i + 2) });
      i += 2;
    } else if (c === '"') {
      let s = "";
      for (i++; i < src.length && src[i] !== '"'; i++) {
        if (src[i] === "\\" && src[i + 1] === "\n") i++;
        else if (src[i] === "\\" && (src[i + 1] === '"' || src[i + 1] === "\\")) s += src[++i];
        else s += src[i];
      }
      if (i >= src.length) throw new Error("Unterminated string");
      i++;
      const prev = out.at(-1);
      if (prev?.kind === "punct" && prev.text === "+" && out.at(-2)?.kind === "id") {
        out.pop();
        out[out.length - 1] = { kind: "id", text: out[out.length - 1].text + s };
      } else out.push({ kind: "id", text: s });
    } else if (c === "<") {
      let depth = 0;
      const start = i;
      do {
        if (src[i] === "<") depth++;
        if (src[i] === ">") depth--;
        i++;
      } while (depth > 0 && i < src.length);
      if (depth > 0) throw new Error("Unterminated HTML string");
      out.push({ kind: "id", text: src.slice(start + 1, i - 1) });
    } else {
      const m = /^(-?(?:\.\d+|\d+(?:\.\d*)?)|[A-Za-z_\u0080-￿][\w\u0080-￿]*)/.exec(src.slice(i));
      if (m) {
        out.push({ kind: "id", text: m[0] });
        i += m[0].length;
      } else {
        out.push({ kind: "punct", text: c });
        i++;
      }
    }
  }
  return out;
}

function skipTo(src: string, from: number, end: string): number {
  const at = src.indexOf(end, from);
  return at === -1 ? src.length : at;
}

type ParsedDot = {
  directed: boolean;
  name?: string;
  graph: Attrs;
  nodes: Map<string, Attrs>;
  edges: { source: string; target: string; attrs: Attrs }[];
};

// recursive descent over the grammar in graphviz lib/cgraph/grammar.y
function parse(tokens: Token[]): ParsedDot {
  let pos = 0;
  const peek = () => tokens[pos];
  const isWord = (t: Token | undefined, word: string) => t?.kind === "id" && t.text.toLowerCase() === word;
  const isPunct = (t: Token | undefined, p: string) => t?.kind === "punct" && t.text === p;
  function expect(p: string) {
    if (!isPunct(peek(), p)) throw new Error(`Expected "${p}" near token ${pos + 1}`);
    pos++;
  }
  function id(): string {
    const t = peek();
    if (t?.kind !== "id") throw new Error(`Expected a name near token ${pos + 1}`);
    pos++;
    return t.text;
  }

  if (isWord(peek(), "strict")) pos++;
  const kind = id().toLowerCase();
  if (kind !== "graph" && kind !== "digraph") throw new Error('A DOT file must start with "graph" or "digraph"');
  const result: ParsedDot = { directed: kind === "digraph", graph: {}, nodes: new Map(), edges: [] };
  if (peek()?.kind === "id") result.name = id();

  function attrList(): Attrs {
    const a: Attrs = {};
    while (isPunct(peek(), "[")) {
      pos++;
      while (!isPunct(peek(), "]")) {
        const key = id();
        expect("=");
        a[key] = id();
        if (isPunct(peek(), ",") || isPunct(peek(), ";")) pos++;
      }
      pos++;
    }
    return a;
  }

  function touchNode(name: string, defaults: Attrs, a: Attrs = {}) {
    const existing = result.nodes.get(name);
    result.nodes.set(name, existing ? { ...existing, ...a } : { ...defaults, ...a });
  }

  // returns the node names a statement list mentions
  function stmtList(nodeDefaults: Attrs, edgeDefaults: Attrs, inSubgraph: boolean): string[] {
    const mentioned: string[] = [];
    expect("{");
    while (!isPunct(peek(), "}")) {
      if (!peek()) throw new Error('Missing closing "}"');
      const t = peek();
      if (isWord(t, "node") || isWord(t, "edge") || (isWord(t, "graph") && isPunct(tokens[pos + 1], "["))) {
        pos++;
        const a = attrList();
        if (t.text.toLowerCase() === "node") Object.assign(nodeDefaults, a);
        else if (t.text.toLowerCase() === "edge") Object.assign(edgeDefaults, a);
        else if (!inSubgraph) Object.assign(result.graph, a);
      } else if (t.kind === "id" && !isWord(t, "subgraph") && isPunct(tokens[pos + 1], "=")) {
        const key = id();
        pos++;
        const value = id();
        if (!inSubgraph) result.graph[key] = value;
      } else {
        const operands = [operand(nodeDefaults, edgeDefaults)];
        while (peek()?.kind === "edgeop") {
          pos++;
          operands.push(operand(nodeDefaults, edgeDefaults));
        }
        const a = attrList();
        if (operands.length === 1 && operands[0].single) touchNode(operands[0].names[0], nodeDefaults, a);
        for (let k = 0; k + 1 < operands.length; k++)
          for (const source of operands[k].names)
            for (const target of operands[k + 1].names)
              result.edges.push({ source, target, attrs: { ...edgeDefaults, ...a } });
        for (const o of operands) mentioned.push(...o.names);
      }
      if (isPunct(peek(), ";") || isPunct(peek(), ",")) pos++;
    }
    pos++;
    return mentioned;
  }

  function operand(nodeDefaults: Attrs, edgeDefaults: Attrs): { names: string[]; single: boolean } {
    if (isWord(peek(), "subgraph") || isPunct(peek(), "{")) {
      if (isWord(peek(), "subgraph")) {
        pos++;
        if (peek()?.kind === "id") pos++;
      }
      const names = stmtList({ ...nodeDefaults }, { ...edgeDefaults }, true);
      return { names: [...new Set(names)], single: false };
    }
    const name = id();
    while (isPunct(peek(), ":")) {
      pos++;
      id();
    }
    touchNode(name, nodeDefaults);
    return { names: [name], single: true };
  }

  stmtList({}, {}, false);
  if (pos < tokens.length) throw new Error("Only one graph per file is supported");
  return result;
}

const truthy = (v: string | undefined) => v !== undefined && /^(true|yes|1)$/i.test(v);
const hexColor = (v: string | undefined) => (v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined);

function parsePos(v: string | undefined): { x: number; y: number } | undefined {
  const m = v && /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/.exec(v);
  if (!m) return undefined;
  return { x: Number(m[1]), y: 0 - Number(m[2]) };
}

// reads dot text into a graph, throws if it isn't valid
export function fromDot(text: string): { doc: GraphDoc; title?: string } {
  const dot = parse(tokenize(text));
  const rootName = dot.graph.root;
  let hasRoot = false;
  const idOf = new Map<string, string>();

  let unplaced = 0;
  const nodes = [...dot.nodes].map(([name, a], i) => {
    const id = String(i);
    idOf.set(name, id);
    const isRoot = !hasRoot && (truthy(a.root) || name === rootName);
    if (isRoot) hasRoot = true;
    const p = parsePos(a.pos) ?? { x: 100 + (unplaced % 10) * 100, y: 100 + Math.floor(unplaced++ / 10) * 100 };
    return { id, label: name, ...p, color: hexColor(a.fillcolor) ?? hexColor(a.color) ?? DEFAULT_NODE_COLOR, isRoot };
  });

  // other tools (e.g. networkx) write plain weight, so accept it too
  const weightOf = (a: Attrs) => a.edge_weight ?? a.weight;
  const weighted = truthy(dot.graph.weighted) || dot.edges.some((e) => weightOf(e.attrs) !== undefined);
  const indexMode = detectIndexMode(nodes);
  let doc: GraphDoc = { version: 1, directed: dot.directed, weighted, indexMode, nodes, edges: [] };
  for (const e of dot.edges) {
    const next = addEdge(doc, idOf.get(e.source)!, idOf.get(e.target)!);
    if (next === doc) continue;
    const added = next.edges.at(-1)!;
    const weight = Number(weightOf(e.attrs));
    added.weight = Number.isFinite(weight) ? weight : DEFAULT_EDGE_WEIGHT;
    added.color = hexColor(e.attrs.color) ?? DEFAULT_EDGE_COLOR;
    doc = next;
  }
  return { doc: parseGraphDoc(doc), title: dot.name };
}
