import { parseGraphDoc, type GraphDoc } from "../../domain/graph/schema";
import { useEditorStore } from "../store";

const KEY = "graph-visualizer:draft";
const DELAY_MS = 500;

export type Draft = { title: string; doc: GraphDoc };

// returns null when missing, unreadable or invalid
export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const title = typeof data?.title === "string" ? data.title : "Untitled graph";
    return { title, doc: parseGraphDoc(data?.doc) };
  } catch {
    return null;
  }
}

function saveDraft(): void {
  const { title, doc } = useEditorStore.getState();
  try {
    localStorage.setItem(KEY, JSON.stringify({ title, doc }));
  } catch {
    return;
  }
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
    if (s.doc === prev.doc && s.title === prev.title) return;
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
