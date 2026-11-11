import { useEffect, useRef, useState, type ReactNode } from "react";
import { compareLabels, reconnectEdge, reverseEdge, setColor, setWeight } from "../../domain/graph/ops";
import {
  DEFAULT_EDGE_COLOR,
  DEFAULT_NODE_COLOR,
  type GraphDoc,
  type GraphEdge,
  type GraphNode,
} from "../../domain/graph/schema";
import { showAlert } from "../dialog/alertStore";
import { deleteSelection } from "../input/useShortcuts";
import { singleNode, useEditorStore } from "../store";
import { Section } from "./Section";
import { dangerButton, inputClass } from "./styles";

const PALETTE = [
  DEFAULT_NODE_COLOR,
  DEFAULT_EDGE_COLOR,
  "#f87171",
  "#facc15",
  "#4ade80",
  "#2dd4bf",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#e0e7ff",
];

const commit = (edit: (doc: GraphDoc) => GraphDoc) => useEditorStore.getState().commit(edit);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-2 block">
      <span className="mb-0.5 block text-xs text-slate-500">{label}</span>
      {children}
    </label>
  );
}

// a label forwards hover and clicks to its first control, so button rows use a group
function ButtonField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="mb-2">
      <span className="mb-0.5 block text-xs text-slate-500">{label}</span>
      {children}
    </div>
  );
}

// saves on enter or blur, escape restores the old value
export function TextField(props: {
  label: string;
  value: string;
  inputMode?: "decimal";
  maxLength?: number;
  onSave: (v: string) => void;
}) {
  return (
    <Field label={props.label}>
      <input
        key={props.value}
        defaultValue={props.value}
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        className={inputClass}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== props.value) props.onSave(v);
          e.target.value = props.value;
        }}
        onKeyDown={(e) => {
          // stop enter reaching the dialog's ok button
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.currentTarget.value = props.value;
            e.currentTarget.blur();
          }
        }}
      />
    </Field>
  );
}

const POP_MS = 1000;

export function ColorRow({ current }: { current?: string }) {
  const selection = useEditorStore((s) => s.selection);
  const [pressed, setPressed] = useState<string | null>(null);
  const [calm, setCalm] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function pick(c: string) {
    commit((d) => setColor(d, selection, c));
    clearTimeout(timer.current);
    setPressed(c);
    setCalm(null);
    timer.current = setTimeout(() => {
      setPressed(null);
      setCalm(c);
    }, POP_MS);
  }
  return (
    <ButtonField label="Color">
      <div className="grid grid-cols-5 gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Color ${c}`}
            aria-pressed={current === c}
            onClick={() => pick(c)}
            onPointerLeave={() => calm === c && setCalm(null)}
            className={`group h-6 w-6 rounded-full ${
              current === c ? "ring-2 ring-slate-900 ring-offset-1" : ""
            }`}
          >
            <span
              className={`block h-full w-full rounded-full border transition-transform duration-150 ease-out ${
                pressed === c ? "scale-75" : calm === c ? "" : "group-hover:scale-125"
              } ${current === c ? "border-slate-900" : "border-slate-400"}`}
              style={{ background: c }}
            />
          </button>
        ))}
      </div>
    </ButtonField>
  );
}

// picks which vertex an edge end sits on
function EndSelect(props: { label: string; value: string; nodes: readonly GraphNode[]; onPick: (id: string) => void }) {
  return (
    <select
      aria-label={props.label}
      value={props.value}
      onChange={(e) => props.onPick(e.target.value)}
      className={`${inputClass} min-w-0 flex-1 font-mono`}
    >
      {props.nodes.map((n) => (
        <option key={n.id} value={n.id}>
          {n.label}
        </option>
      ))}
    </select>
  );
}

function EdgeFields({ edge }: { edge: GraphEdge }) {
  const directed = useEditorStore((s) => s.doc.directed);
  const weighted = useEditorStore((s) => s.doc.weighted);
  const nodes = useEditorStore((s) => s.doc.nodes);
  const sorted = [...nodes].sort((a, b) => compareLabels(a.label, b.label));

  // picking the other end's vertex flips the edge instead of making a loop
  function pick(end: "source" | "target", nodeId: string) {
    if (edge[end] === nodeId) return;
    const other = end === "source" ? edge.target : edge.source;
    const change = (d: GraphDoc) => (nodeId === other ? reverseEdge(d, edge.id) : reconnectEdge(d, edge.id, end, nodeId));
    const doc = useEditorStore.getState().doc;
    if (change(doc) !== doc) {
      commit(change);
      return;
    }
    if (nodeId === other && !directed) return;
    const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? "?";
    const [from, to] = end === "source" ? [nodeId, other] : [other, nodeId];
    const [a, b] = nodeId === other ? [edge.target, edge.source] : [from, to];
    showAlert(
      "Can't move edge",
      directed
        ? `An edge from ${label(a)} to ${label(b)} already exists.`
        : `An edge between ${label(a)} and ${label(b)} already exists.`,
    );
  }

  return (
    <>
      <div className="mb-2 flex items-center gap-1.5">
        <EndSelect label={directed ? "Source" : "First end"} value={edge.source} nodes={sorted} onPick={(id) => pick("source", id)} />
        {directed ? (
          <span aria-hidden className="text-slate-500">→</span>
        ) : (
          <span aria-hidden className="h-0.5 w-3 shrink-0 rounded bg-slate-500" />
        )}
        <EndSelect label={directed ? "Target" : "Second end"} value={edge.target} nodes={sorted} onPick={(id) => pick("target", id)} />
      </div>
      {weighted ? (
        <TextField
          label="Weight"
          value={String(edge.weight)}
          inputMode="decimal"
          onSave={(v) => v !== "" && Number.isFinite(Number(v)) && commit((d) => setWeight(d, edge.id, Number(v)))}
        />
      ) : (
        <p className="mb-2 text-xs text-slate-500">Turn on Weighted to give edges weights.</p>
      )}
      <ColorRow current={edge.color} />
    </>
  );
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function SelectionPanel() {
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);
  const total = selection.nodes.length + selection.edges.length;

  if (singleNode(selection)) return null;

  const edge = total === 1 && selection.edges.length === 1 ? doc.edges.find((e) => e.id === selection.edges[0]) : undefined;
  let body;
  if (total === 0) {
    body = <p className="text-xs text-slate-500">Click a vertex or edge to view and edit its attributes.</p>;
  } else if (edge) {
    body = <EdgeFields key={edge.id} edge={edge} />;
  } else {
    body = (
      <>
        <p className="mb-2 text-sm">
          {[
            selection.nodes.length > 0 && count(selection.nodes.length, "vertex", "vertices"),
            selection.edges.length > 0 && count(selection.edges.length, "edge", "edges"),
          ]
            .filter(Boolean)
            .join(", ")}{" "}
          selected
        </p>
        <ColorRow />
      </>
    );
  }

  return (
    <Section title="Information">
      {body}
      {total > 0 && (
        <button type="button" onClick={deleteSelection} className={dangerButton}>
          DELETE {total > 1 ? "SELECTED" : "EDGE"}
        </button>
      )}
    </Section>
  );
}
