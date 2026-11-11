import { useEffect } from "react";
import { removeEdge, removeNode } from "../../domain/graph/ops";
import { isTyping } from "./keys";
import { isLocked, useEditorStore } from "../store";
import { toolForKey } from "./tools";

export function deleteSelection() {
  const { selection, commit } = useEditorStore.getState();
  if (selection.nodes.length === 0 && selection.edges.length === 0) return;
  commit((d) => {
    let next = d;
    for (const id of selection.edges) next = removeEdge(next, id);
    for (const id of selection.nodes) next = removeNode(next, id);
    return next;
  });
}

// one listener for the whole editor, however many panels exist
export function useShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // a dialog owns the keyboard while it is open
      if (isTyping(e) || document.querySelector("dialog[open]")) return;
      const store = useEditorStore.getState();
      if (isLocked(store)) return;
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        store.redo();
      } else if (key === "delete" || key === "backspace") {
        e.preventDefault();
        deleteSelection();
      } else if (!mod && !e.altKey && toolForKey(key)) {
        store.setTool(toolForKey(key)!);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
