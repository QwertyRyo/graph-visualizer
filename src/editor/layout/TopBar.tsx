import { useRef, type ReactNode } from "react";
import completeIcon from "../../assets/full.svg";
import gridIcon from "../../assets/grid-SVG.svg";
import cycleIcon from "../../assets/hex.svg";
import lineIcon from "../../assets/line.svg";
import treeIcon from "../../assets/tree-SVG.svg";
import trashUrl from "../../assets/trash.png";
import type { IndexMode } from "../../domain/graph/indexing";
import { setIndexMode } from "../../domain/graph/ops";
import { FILTERS, filterApplies } from "../../domain/graph/filters";
import { PRESETS } from "../../domain/graph/presets";
import { algorithmError, ALGORITHMS } from "../../domain/graph/traversal";
import { insertPreset } from "../presets";
import { MENU_DATA_VIEWS, type DataViewId } from "../data/dataViews";
import { exportGraph, GraphSONImportError, readGraphFile, type ExportFormat } from "../persistence/graphFile";
import { GraphMLImportError } from "../persistence/graphml";
import { useCanvasRegistry } from "../canvas/canvasRegistry";
import { runLayout } from "../canvas/layouts";
import { Menu } from "./Menu";
import { showAlert } from "../dialog/alertStore";
import { isLocked, lockHint, useEditorStore } from "../store";
import { floatingButton, floatingCard } from "./styles";

function Button(props: { title?: string; label?: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={floatingButton}
    >
      {props.children}
    </button>
  );
}

// a curved arrow pointing back, mirrored for redo
function HistoryIcon({ redo = false }: { redo?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={redo ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

const EXPORT_FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "gv", label: "Graphviz DOT (.gv)" },
  { id: "json", label: "GraphSON 3.0 (.json)" },
  { id: "graphml", label: "GraphML (.graphml)" },
];

const INDEX_MODE_ITEMS: { id: IndexMode; label: string }[] = [
  { id: "zero", label: "0-indexed" },
  { id: "one", label: "1-indexed" },
  { id: "alpha", label: "Alphabet" },
];

const PRESET_ICONS: Record<string, string> = {
  "path-3": lineIcon,
  "cycle-6": cycleIcon,
  "tree-3": treeIcon,
  "complete-6": completeIcon,
  "grid-3x3": gridIcon,
};
const PRESET_ITEMS = PRESETS.map((p) => ({ id: p.id, label: p.label, icon: PRESET_ICONS[p.id] ?? trashUrl }));

type Props = { dataView: DataViewId | null; onDataView: (view: DataViewId) => void };

export function TopBar({ dataView, onDataView }: Props) {
  const title = useEditorStore((s) => s.title);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const indexMode = useEditorStore((s) => s.doc.indexMode);
  const directed = useEditorStore((s) => s.doc.directed);
  const filters = useEditorStore((s) => s.filters);
  const locked = useEditorStore(isLocked);
  const algorithm = useEditorStore((s) => s.run?.traversal.algorithm ?? null);
  const hasNodes = useEditorStore((s) => s.doc.nodes.length > 0);
  const { setTitle, undo, redo, replaceDoc, commit, toggleFilter, startRun } = useEditorStore.getState();
  const fileInput = useRef<HTMLInputElement>(null);
  const lockedHint = useEditorStore(lockHint);
  const algorithmsHint = filters.length > 0 ? "Turn off filters first" : !hasNodes ? "Add vertices first" : undefined;
  const filterItems = FILTERS.map((f) => ({
    ...f,
    disabled: !filterApplies(f.id, directed),
    title: filterApplies(f.id, directed) ? undefined : "Needs a directed graph",
  }));

  async function onImport(file: File | undefined) {
    if (!file) return;
    try {
      const { doc, title } = await readGraphFile(file);
      replaceDoc(doc);
      const cy = useCanvasRegistry.getState().active;
      if (cy) runLayout(cy, "grid", false);
      if (title) setTitle(title);
    } catch (err) {
      if (err instanceof GraphSONImportError) showAlert("Can't import file", "GraphSON files can't be imported yet.");
      else if (err instanceof GraphMLImportError) showAlert("Can't import file", `That GraphML file couldn't be read: ${err.message}.`);
      else showAlert("Can't import file", "That file isn't a valid graph.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Graph title"
        maxLength={120}
        disabled={locked}
        title={lockedHint}
        className={`h-9 w-48 px-3 text-sm font-medium focus:border-slate-400 disabled:text-slate-400 ${floatingCard}`}
      />
      <Button title={lockedHint ?? "Undo (⌘Z)"} label="Undo" disabled={!canUndo || locked} onClick={undo}>
        <HistoryIcon />
      </Button>
      <Button title={lockedHint ?? "Redo (⇧⌘Z)"} label="Redo" disabled={!canRedo || locked} onClick={redo}>
        <HistoryIcon redo />
      </Button>
      <Menu
        label="Presets"
        align="left"
        items={PRESET_ITEMS}
        disabled={locked}
        title={lockedHint}
        buttonClassName={floatingButton}
        onSelect={(id) => {
          const preset = PRESETS.find((p) => p.id === id);
          if (preset) insertPreset(preset);
        }}
      />
      <Menu
        label={filters.length > 0 ? `Filter (${filters.length})` : "Filter"}
        align="left"
        items={filterItems}
        selected={filters}
        disabled={algorithm !== null}
        title={algorithm ? "Click Done to use filters" : undefined}
        buttonClassName={`${floatingButton} ${filters.length > 0 ? "bg-accent-soft text-accent-strong" : ""}`}
        onSelect={toggleFilter}
      />
      <Menu
        label="Algorithms"
        align="left"
        items={ALGORITHMS}
        selected={algorithm}
        disabled={algorithmsHint !== undefined}
        title={algorithmsHint}
        buttonClassName={`${floatingButton} ${algorithm ? "bg-accent-soft text-accent-strong" : ""}`}
        onSelect={(id) => {
          const error = algorithmError(useEditorStore.getState().doc, id);
          if (error) return showAlert(error.title, error.message);
          startRun(id);
          onDataView("schedule");
        }}
      />
      <Button title={lockedHint} disabled={locked} onClick={() => fileInput.current?.click()}>
        Import
      </Button>
      <Menu
        label="Export"
        align="left"
        items={EXPORT_FORMATS}
        buttonClassName={floatingButton}
        onSelect={(format) => exportGraph(useEditorStore.getState().doc, title, format)}
      />
      <Button title="Sign-in and saving arrive in Part D" disabled onClick={() => {}}>
        Save
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".gv,.dot,.json,.graphml,.xml"
        className="hidden"
        onChange={(e) => {
          void onImport(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Menu
        label={INDEX_MODE_ITEMS.find((m) => m.id === indexMode)?.label ?? "Index Mode"}
        items={INDEX_MODE_ITEMS}
        selected={indexMode}
        align="left"
        disabled={locked}
        title={lockedHint}
        buttonClassName={floatingButton}
        onSelect={(mode) => commit((d) => setIndexMode(d, mode))}
      />
      <Menu label="Data" items={MENU_DATA_VIEWS} selected={dataView} buttonClassName={floatingButton} onSelect={onDataView} />
    </div>
  );
}
