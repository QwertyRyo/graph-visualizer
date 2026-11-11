import { useEffect, useState } from "react";
import { emptyGraph } from "../domain/graph/schema";
import { DataView } from "../editor/data/DataView";
import { DATA_VIEWS, type DataViewId } from "../editor/data/dataViews";
import { loadDraft, startDraftAutosave } from "../editor/persistence/draft";
import { GraphCanvas } from "../editor/canvas/GraphCanvas";
import { AlgorithmBar } from "../editor/layout/AlgorithmBar";
import { NodePopup } from "../editor/layout/NodePopup";
import { Sidebar } from "../editor/layout/Sidebar";
import { useEditorStore } from "../editor/store";
import { TopBar } from "../editor/layout/TopBar";
import { useShortcuts } from "../editor/input/useShortcuts";
import { floatingCard } from "../editor/layout/styles";
import { WindowBar, WindowClose } from "../editor/layout/WindowBar";

export function EditorPage() {
  const [chosenView, setDataView] = useState<DataViewId | null>(null);
  useShortcuts();

  useEffect(() => {
    const draft = loadDraft();
    useEditorStore.getState().load(draft?.doc ?? emptyGraph(), draft?.title ?? "Untitled graph", draft ?? undefined);
    return startDraftAutosave();
  }, []);

  const running = useEditorStore((s) => s.run !== null);
  const dataView = chosenView === "schedule" && !running ? null : chosenView;

  const viewLabel = DATA_VIEWS.find((v) => v.id === dataView)?.label;

  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-0">
        <GraphCanvas />
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3 pb-8">
        <div data-floating="top" className="[&>*>*]:pointer-events-auto">
          <TopBar dataView={dataView} onDataView={setDataView} />
        </div>
        <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
          <div data-floating="left" className="flex h-full flex-col items-start justify-between gap-3">
            <div className="pointer-events-auto flex min-h-0">
              <Sidebar />
            </div>
            <div className="pointer-events-auto">
              <NodePopup />
            </div>
          </div>
          {dataView && (
            <aside
              data-floating="right"
              className={`pointer-events-auto mb-12 flex max-h-[calc(100%-3rem)] w-96 flex-col overflow-hidden ${floatingCard}`}
            >
              <WindowBar title={viewLabel ?? "Data"}>
                <WindowClose label="Close data panel" onClick={() => setDataView(null)} />
              </WindowBar>
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <DataView view={dataView} />
              </div>
            </aside>
          )}
        </div>
      </div>
      <AlgorithmBar />
    </div>
  );
}
