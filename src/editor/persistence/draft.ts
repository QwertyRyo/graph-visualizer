import { parseGraphDoc, type GraphDoc } from "../../domain/graph/schema";
import { useEditorStore } from "../store";

const KEY = "graph-visualizer:draft";
const DELAY_MS = 500;

// graphId and dirty remember which saved graph this is and whether it has unsaved edits
export type Draft = { title: string; doc: GraphDoc; graphId: string | null; dirty: boolean };

// returns null when missing, unreadable or invalid
export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const title = typeof data?.title === "string" ? data.title : "Untitled graph";
    const graphId = typeof data?.graphId === "string" ? data.graphId : null;
    const dirty = graphId ? data?.dirty === true : false;
    return { title, doc: parseGraphDoc(data?.doc), graphId, dirty };
  } catch {
    return null;
  }
}

// false when storage is unavailable or full
export function writeDraft(draft: Draft): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

// after a saved graph is deleted, the canvas keeps its contents but is no longer linked to it
export function forgetInEditor(graphId: string): void {
  const draft = loadDraft();
  if (draft?.graphId === graphId) writeDraft({ ...draft, graphId: null, dirty: false });
}

function saveDraft(): void {
  const { title, doc, graphId, dirty } = useEditorStore.getState();
  writeDraft({ title, doc, graphId, dirty });
}

// saves title and doc after edits, returns a stop function
export function startDraftAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    saveDraft();
  };

  const unsubscribe = useEditorStore.subscribe((s, prev) => {
    if (s.doc === prev.doc && s.title === prev.title && s.graphId === prev.graphId && s.dirty === prev.dirty) return;
    clearTimeout(timer);
    timer = setTimeout(flush, DELAY_MS);
  });

  window.addEventListener("pagehide", flush);
  return () => {
    flush();
    window.removeEventListener("pagehide", flush);
    unsubscribe();
  };
}
