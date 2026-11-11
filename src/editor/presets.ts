import { addPreset, canAddPreset, presetOrigin, type Preset } from "../domain/graph/presets";
import { MAX_NODES } from "../domain/graph/schema";
import { useCanvasRegistry } from "./canvas/canvasRegistry";
import { growNext } from "./canvas/growHints";
import { showAlert } from "./dialog/alertStore";
import { useEditorStore } from "./store";

export function insertPreset(preset: Preset) {
  const { doc, commit } = useEditorStore.getState();
  if (!canAddPreset(doc, preset)) {
    showAlert("Can't add preset", `A graph can have at most ${MAX_NODES} vertices.`);
    return;
  }

  const cy = useCanvasRegistry.getState().active;
  const extent = cy?.extent();
  const origin = presetOrigin(doc, preset) ?? (extent ? { x: (extent.x1 + extent.x2) / 2, y: (extent.y1 + extent.y2) / 2 } : { x: 0, y: 0 });

  let nodeIds: string[] = [];
  commit((d) => {
    const result = addPreset(d, preset, origin);
    nodeIds = result.nodeIds;
    growNext(nodeIds);
    return result.doc;
  });
  if (!cy || nodeIds.length === 0) return;

  const ids = new Set(nodeIds);
  const added = useEditorStore.getState().doc.nodes.filter((n) => ids.has(n.id));
  const xs = added.map((n) => n.x);
  const ys = added.map((n) => n.y);
  const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const zoom = cy.zoom();
  cy.stop();
  cy.animate(
    { pan: { x: cy.width() / 2 - centre.x * zoom, y: cy.height() / 2 - centre.y * zoom } },
    { duration: 300, easing: "ease-out-cubic" },
  );
}
