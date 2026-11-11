import { create } from "zustand";
import type { FilterId } from "../domain/graph/filters";
import { emptyGraph, type GraphDoc } from "../domain/graph/schema";
import { algorithmError, traverse, type AlgorithmId, type Traversal } from "../domain/graph/traversal";

export type Tool = "select" | "node" | "edge";
export type Selection = { nodes: string[]; edges: string[] };
export type AlgorithmRun = { traversal: Traversal; position: number; playing: boolean };

// the id of the one selected vertex, when nothing else is selected
export const singleNode = (s: Selection) => (s.nodes.length === 1 && s.edges.length === 0 ? s.nodes[0] : null);

export const MAX_HISTORY = 100;
const noSelection = (): Selection => ({ nodes: [], edges: [] });

type EditorState = {
  doc: GraphDoc;
  title: string;
  graphId: string | null;
  tool: Tool;
  selection: Selection;
  dirty: boolean;
  past: GraphDoc[];
  future: GraphDoc[];
  filters: FilterId[];
  run: AlgorithmRun | null;

  commit:(edit: (doc: GraphDoc) => GraphDoc) => void;
  replaceDoc: (doc: GraphDoc) => void;
  load: (doc: GraphDoc, title?: string, saved?: { graphId: string | null; dirty: boolean }) => void;
  newGraph: () => void;
  undo: () => void;
  redo: () => void;

  setTool: (tool: Tool) => void;
  setSelection: (selection: Selection) => void;
  setTitle: (title: string) => void;
  markSaved: (graphId: string, saved: { doc: GraphDoc; title: string }) => void;
  toggleFilter: (id: FilterId) => void;
  clearFilters: () => void;
  startRun: (algorithm: AlgorithmId) => void;
  setRunPosition: (position: number) => void;
  setPlaying: (playing: boolean) => void;
  endRun: () => void;
};

type LockState = { filters: readonly FilterId[]; run: AlgorithmRun | null };

// editing is off while any filter is on or an algorithm runs
export const isLocked = (s: LockState) => s.filters.length > 0 || s.run !== null;

// why editing is off, for the hover hint on disabled controls
export const lockHint = (s: LockState) =>
  s.run ? "Click Done to edit" : s.filters.length > 0 ? "Turn off filters to edit" : undefined;

function pruneSelection(sel: Selection, doc: GraphDoc): Selection {
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  const edgeIds = new Set(doc.edges.map((e) => e.id));
  return {
    nodes: sel.nodes.filter((id) => nodeIds.has(id)),
    edges: sel.edges.filter((id) => edgeIds.has(id)),
  };
}

export const useEditorStore = create<EditorState>()((set) => ({
  doc: emptyGraph(),
  title: "Untitled graph",
  graphId: null,
  tool: "select",
  selection: noSelection(),
  dirty: false,
  past: [],
  future: [],
  filters: [],
  run: null,

  // edits, imports, undo and redo all stop while filtering: the backstop
  // behind the disabled buttons and canvas handlers
  commit: (edit) =>
    set((s) => {
      if (isLocked(s)) return s;
      const next = edit(s.doc);
      if (next === s.doc) return s; 
      return {
        doc: next,
        past: [...s.past, s.doc].slice(-MAX_HISTORY),
        future: [],
        selection: pruneSelection(s.selection, next),
        dirty: true,
      };
    }),

  replaceDoc: (doc) =>
    set((s) => isLocked(s) ? s : ({
      doc,
      past: [...s.past, s.doc].slice(-MAX_HISTORY),
      future: [],
      selection: pruneSelection(s.selection, doc),
      dirty: true,
    })),

  // a run belongs to the graph it was made from, so a new graph ends it
  load: (doc, title, saved) =>
    set((s) => ({
      doc,
      title: title ?? s.title,
      graphId: saved?.graphId ?? null,
      past: [],
      future: [],
      selection: noSelection(),
      dirty: saved?.dirty ?? false,
      run: null,
    })),

  // a blank canvas that isn't linked to any saved graph
  newGraph: () =>
    set({
      doc: emptyGraph(),
      title: "Untitled graph",
      graphId: null,
      past: [],
      future: [],
      selection: noSelection(),
      dirty: false,
      filters: [],
      run: null,
    }),

  undo: () =>
    set((s) => {
      const previous = s.past[s.past.length - 1];
      if (!previous || isLocked(s)){
        return s;
      }
          
      return {
        doc: previous,
        past: s.past.slice(0, -1),
        future: [s.doc, ...s.future],
        selection: pruneSelection(s.selection, previous),
        dirty: true,
      };
    }),

  redo: () =>
    set((s) => {
      const [next, ...rest] = s.future;
      if (!next || isLocked(s)) return s;
      return {
        doc: next,
        past: [...s.past, s.doc].slice(-MAX_HISTORY),
        future: rest,
        selection: pruneSelection(s.selection, next),
        dirty: true,
      };
    }),

  setTool: (tool) => set({ tool }),
  setSelection: (selection) => set({ selection }),
  setTitle: (title) => set({ title, dirty: true }),
  // edits made while the save was in flight keep the graph dirty
  markSaved: (graphId, saved) =>
    set((s) => ({ graphId, dirty: s.doc !== saved.doc || s.title !== saved.title })),
  // turning a filter on drops the selection, so no edit panel stays open
  toggleFilter: (id) =>
    set((s) => {
      // both would dim the graph, so filters wait until the run is done
      if (s.run) return s;
      const filters = s.filters.includes(id) ? s.filters.filter((f) => f !== id) : [...s.filters, id];
      return { filters, selection: filters.length > 0 ? noSelection() : s.selection };
    }),
  clearFilters: () => set({ filters: [] }),

  // picking an algorithm, even the running one, starts over from the first step
  startRun: (algorithm) =>
    set((s) => {
      // the menu explains a missing root; this is the backstop
      if (s.filters.length > 0 || s.doc.nodes.length === 0 || algorithmError(s.doc, algorithm)) return s;
      return { run: { traversal: traverse(s.doc, algorithm), position: 0, playing: false }, selection: noSelection() };
    }),
  // reaching the last step pauses
  setRunPosition: (position) =>
    set((s) => {
      if (!s.run) return s;
      const end = s.run.traversal.steps.length;
      const clamped = Math.max(0, Math.min(position, end));
      return { run: { ...s.run, position: clamped, playing: s.run.playing && clamped < end } };
    }),
  setPlaying: (playing) => set((s) => (s.run ? { run: { ...s.run, playing } } : s)),
  endRun: () => set({ run: null }),
}));
