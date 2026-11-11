import { setRoot } from "../../domain/graph/ops";
import { MAX_LABEL_LENGTH } from "../../domain/graph/schema";
import { deleteSelection } from "../input/useShortcuts";
import { tryRelabel } from "../relabel";
import { singleNode, useEditorStore } from "../store";
import { ColorRow, TextField } from "./SelectionPanel";
import { useCanvasRegistry } from "../canvas/canvasRegistry";
import { dangerButton, floatingCard } from "./styles";
import { WindowBar, WindowClose } from "./WindowBar";

// details of the one selected vertex, rising from the bottom-left corner
export function NodePopup() {
  const doc = useEditorStore((s) => s.doc);
  const id = useEditorStore((s) => singleNode(s.selection));
  const node = id ? doc.nodes.find((n) => n.id === id) : undefined;
  if (!node) return null;

  const commit = useEditorStore.getState().commit;

  return (
    <section
      key={node.id}
      aria-label="Vertex details"
      className={`w-64 ${floatingCard}`}
    >
      <WindowBar title="Vertex">
        <WindowClose label="Deselect" onClick={() => useCanvasRegistry.getState().active?.elements(":selected").unselect()} />
      </WindowBar>
      <div className="p-3">
      <TextField label="Name" value={node.label} maxLength={MAX_LABEL_LENGTH} onSave={(v) => tryRelabel(node.id, v)} />

      <label className="mb-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={node.isRoot} onChange={(e) => commit((d) => setRoot(d, node.id, e.target.checked))} />
        Root
      </label>

      <ColorRow current={node.color} />

      <button type="button" title="Delete vertex (Delete)" onClick={deleteSelection} className={dangerButton}>
        Delete vertex
      </button>
      </div>
    </section>
  );
}
