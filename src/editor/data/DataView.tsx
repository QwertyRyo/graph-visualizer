import { useMemo } from "react";
import { compareLabels } from "../../domain/graph/ops";
import type { GraphDoc, GraphNode } from "../../domain/graph/schema";
import { edgeWeight, isMst, mstTableOrder, stateAt } from "../../domain/graph/traversal";
import { adjacencyList, adjacencyMatrix } from "../../domain/graph/views";
import type { DataViewId } from "./dataViews";
import { useEditorStore, type AlgorithmRun } from "../store";


function NodeLabel({ node }: { node: GraphNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-full border border-slate-400" style={{ background: node.color }} />
      {node.label}
    </span>
  );
}

function Matrix({ doc, selected }: { doc: GraphDoc; selected: Set<string> }) {
  const { nodes, cells } = useMemo(() => adjacencyMatrix(doc), [doc]);
  // weighted shows weights, unweighted shows 1 and 0
  const show = (w: number | null) => (doc.weighted ? (w ?? "–") : w === null ? 0 : 1);
  const head = (n: GraphNode) =>
    `sticky bg-slate-100 px-2 py-1 font-medium ${selected.has(n.id) ? "text-accent-strong" : ""}`;

  return (
    <table className="border-separate border-spacing-0 font-mono text-xs">
      <thead>
        <tr>
          <th className="sticky top-0 left-0 z-20 bg-slate-100" />
          {nodes.map((n) => (
            <th key={n.id} className={`${head(n)} top-0 z-10`}>
              {n.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {nodes.map((row, i) => (
          <tr key={row.id}>
            <th className={`${head(row)} left-0 z-10 text-left`}>
              <NodeLabel node={row} />
            </th>
            {cells[i].map((w, j) => (
              <td
                key={nodes[j].id}
                className={`border-b border-r border-slate-100 px-2 py-1 text-center ${
                  w === null ? "text-slate-300" : "bg-accent-soft text-slate-900"
                }`}
              >
                {show(w)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function List({ doc, selected }: { doc: GraphDoc; selected: Set<string> }) {
  const rows = useMemo(() => adjacencyList(doc), [doc]);
  return (
    <ul className="space-y-1 font-mono text-sm">
      {rows.map(({ node, neighbors }) => (
        <li key={node.id} className={selected.has(node.id) ? "text-accent-strong" : ""}>
          <NodeLabel node={node} />
          <span className="text-slate-400"> → </span>
          {neighbors.length === 0 ? (
            <span className="text-slate-400">∅</span>
          ) : (
            neighbors
              .map((n) => (doc.weighted ? `${n.node.label} (${n.weight})` : n.node.label))
              .join(", ")
          )}
        </li>
      ))}
    </ul>
  );
}

// kruskal and prim: every edge in the order it's checked, and what became of it
function MstTable({ doc, run }: { doc: GraphDoc; run: AlgorithmRun }) {
  const { traversal, position } = run;
  const state = useMemo(() => stateAt(traversal, position), [traversal, position]);
  const { order, unneeded } = useMemo(() => mstTableOrder(doc, traversal), [doc, traversal]);
  if (order.length === 0) return <p className="p-2 text-sm text-slate-500">The graph has no edges to build a tree from.</p>;

  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(doc.edges.map((e) => [e.id, e]));
  const done = position >= traversal.steps.length;
  const current = state.step?.kind === "mst-edge" ? state.step.edge : null;
  const total = [...state.treeEdges].reduce((sum, id) => sum + edgeWeight(doc, edgeById.get(id)?.weight ?? 0), 0);
  const result = (id: string) => {
    if (state.treeEdges.has(id)) return <span className="font-semibold text-slate-900">in tree</span>;
    if (state.rejectedEdges.has(id)) return <span className="text-slate-500">skipped, cycle</span>;
    if (done && unneeded.has(id)) return <span className="text-slate-400">not needed</span>;
    if (done) return <span className="text-slate-400">not reached</span>;
    return <span className="text-slate-300">–</span>;
  };

  return (
    <table className="w-full border-separate border-spacing-0 font-mono text-xs">
      <thead>
        <tr>
          <th className="sticky top-0 z-10 bg-slate-100 px-2 py-1 text-left font-medium">edge</th>
          <th className="sticky top-0 z-10 bg-slate-100 px-2 py-1 text-right font-medium">weight</th>
          <th className="sticky top-0 z-10 bg-slate-100 px-2 py-1 text-right font-medium">result</th>
        </tr>
      </thead>
      <tbody>
        {order.map((id) => {
          const e = edgeById.get(id)!;
          return (
            <tr key={id} className={id === current ? "bg-accent-soft" : ""}>
              <th className="border-b border-slate-100 px-2 py-1 text-left font-normal">
                {byId.get(e.source)?.label}–{byId.get(e.target)?.label}
              </th>
              <td className="border-b border-slate-100 px-2 py-1 text-right tabular-nums">{edgeWeight(doc, e.weight)}</td>
              <td className={`border-b border-slate-100 px-2 py-1 text-right ${id === current ? "font-semibold" : ""}`}>{result(id)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <th className="px-2 py-1 text-left font-medium">total</th>
          <td className="px-2 py-1 text-right font-medium tabular-nums">{total}</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

type Column = "discovery" | "finish" | "low" | "distance" | "previous";

// the run's timestamps so far, one row per vertex in label order
function Schedule({ doc, run }: { doc: GraphDoc; run: AlgorithmRun }) {
  const { traversal, position } = run;
  const state = useMemo(() => stateAt(traversal, position), [traversal, position]);
  const rows = useMemo(() => [...doc.nodes].sort((a, b) => compareLabels(a.label, b.label)), [doc]);
  const dijkstra = traversal.algorithm === "dijkstra";
  const columns: Column[] =
    traversal.algorithm === "dfs" ? ["discovery", "finish", "low"] : dijkstra ? ["distance", "previous"] : ["discovery", "distance"];
  const heading = (c: Column) => (c === "distance" ? "distance from root" : c);
  const label = new Map(doc.nodes.map((n) => [n.id, n.label]));
  const blank = <span className="text-slate-300">–</span>;
  const cell = (c: Column, id: string) => {
    if (c === "previous") return state.previous.has(id) ? label.get(state.previous.get(id)!) : blank;
    const v = state[c].get(id);
    if (v === undefined) return dijkstra && c === "distance" ? "∞" : blank;
    return v === Infinity ? "∞" : v;
  };

  const step = state.step;
  const changed = new Set<string>();
  if (step?.kind === "discover") changed.add(`${step.node}:discovery`).add(`${step.node}:low`).add(`${step.node}:distance`);
  if (step?.kind === "finish") changed.add(`${step.node}:finish`);
  if (step?.kind === "relax" && step.improved) changed.add(`${step.other}:distance`).add(`${step.other}:previous`);
  for (const c of step?.low ?? []) changed.add(`${c.node}:low`);
  const final = (id: string) => dijkstra && state.status.get(id) === "closed";

  return (
    <table className="w-full border-separate border-spacing-0 font-mono text-xs">
      <thead>
        <tr>
          <th className="sticky top-0 z-10 bg-slate-100 px-2 py-1 text-left font-medium">vertex</th>
          {columns.map((c) => (
            <th key={c} className="sticky top-0 z-10 bg-slate-100 px-2 py-1 text-right font-medium">
              {heading(c)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((n) => (
          <tr key={n.id} className={step?.node === n.id ? "bg-accent-soft" : ""}>
            <th className="border-b border-slate-100 px-2 py-1 text-left font-normal">
              <NodeLabel node={n} />
            </th>
            {columns.map((c) => (
              <td
                key={c}
                className={`border-b border-slate-100 px-2 py-1 text-right tabular-nums ${
                  changed.has(`${n.id}:${c}`) ? "font-semibold text-accent-strong" : final(n.id) ? "font-semibold" : ""
                }`}
              >
                {cell(c, n.id)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DataView({ view }: { view: DataViewId }) {
  const doc = useEditorStore((s) => s.doc);
  const run = useEditorStore((s) => s.run);
  const selection = useEditorStore((s) => s.selection);
  const selected = useMemo(() => new Set(selection.nodes), [selection]);

  if (view === "schedule") {
    if (run && isMst(run.traversal.algorithm)) return <MstTable doc={doc} run={run} />;
    if (run) return <Schedule doc={doc} run={run} />;
    return <p className="p-2 text-sm text-slate-500">Pick an algorithm from the Algorithms menu to fill this table.</p>;
  }
  if (doc.nodes.length === 0) {
    return <p className="p-2 text-sm text-slate-500">Add nodes to see the graph's data.</p>;
  }
  return view === "matrix" ? <Matrix doc={doc} selected={selected} /> : <List doc={doc} selected={selected} />;
}
