import { labelError, relabelNode } from "../domain/graph/ops";
import { showAlert } from "./dialog/alertStore";
import { useEditorStore } from "./store";

// renames a vertex, or explains in a dialog why it can't
export function tryRelabel(id: string, label: string): boolean {
  const { doc, commit } = useEditorStore.getState();
  const current = doc.nodes.find((n) => n.id === id);
  if (!current || label === "" || label === current.label) return false;
  const error = labelError(doc, id, label);
  if (error) {
    showAlert("Can't rename vertex", error);
    return false;
  }
  commit((d) => relabelNode(d, id, label));
  return true;
}
