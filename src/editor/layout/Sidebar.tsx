import { setDirected, setWeighted } from "../../domain/graph/ops";
import { isLocked, lockHint, useEditorStore } from "../store";
import { TOOLS } from "../input/tools";
import { Section } from "./Section";
import { SelectionPanel } from "./SelectionPanel";
import { buttonClass, dangerButton, floatingCard } from "./styles";
import { WindowBar } from "./WindowBar";

export function Sidebar() {
  const tool = useEditorStore((s) => s.tool);
  const directed = useEditorStore((s) => s.doc.directed);
  const weighted = useEditorStore((s) => s.doc.weighted);
  const nodeCount = useEditorStore((s) => s.doc.nodes.length);
  const edgeCount = useEditorStore((s) => s.doc.edges.length);
  const { setTool, commit } = useEditorStore.getState();
  const root = useEditorStore((s) => s.doc.nodes.find((n) => n.isRoot));
  const locked = useEditorStore(isLocked);
  const hint = useEditorStore(lockHint);

  return (
    <aside className={`flex min-h-0 w-52 shrink flex-col ${floatingCard}`}>
      <WindowBar title="Editor" />
      <div className="min-h-0 overflow-y-auto">
      <fieldset disabled={locked} title={hint} className="contents">
      <Section title="Mode">
        <div className="grid grid-cols-3 gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              type="button"
              title={`${t.label} (${t.key})`}
              aria-pressed={tool === t.tool}
              onClick={() => setTool(t.tool)}
              className={`${buttonClass(tool === t.tool)} px-0!`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Graph">
        <label className="flex items-center gap-2 py-0.5 text-sm">
          <input type="checkbox" checked={directed} onChange={(e) => commit((d) => setDirected(d, e.target.checked))} />
          Directed
        </label>
        <label className="flex items-center gap-2 py-0.5 text-sm">
          <input type="checkbox" checked={weighted} onChange={(e) => commit((d) => setWeighted(d, e.target.checked))} />
          Weighted
        </label>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm whitespace-nowrap">
          <dt className="text-slate-500">Vertex Count: </dt>
          <dd>{nodeCount}</dd>
          <dt className="text-slate-500">Edge Count: </dt>
          <dd>{edgeCount}</dd>
          <dt className="text-slate-500">Root: </dt>
          <dd>{root?.label ?? "none"}</dd>
        </dl>
        <button
          type="button"
          disabled={nodeCount === 0}
          onClick={() => commit((d) => ({ ...d, nodes: [], edges: [] }))}
          className={`${dangerButton} mt-3`}
        >
          CLEAR GRAPH
        </button>
      </Section>

      <SelectionPanel />
      </fieldset>
      </div>
    </aside>
  );
}
