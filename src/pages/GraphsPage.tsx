import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { openAuthDialog } from "../auth/authDialogStore";
import { useAuth } from "../data/auth";
import trashUrl from "../assets/trash.png";
import { deleteGraph, GraphNotFoundError, listGraphs, loadGraph, type GraphSummary } from "../data/graphs";
import { showAlert, showConfirm } from "../editor/dialog/alertStore";
import { forgetInEditor, writeDraft } from "../editor/persistence/draft";
import { floatingCard, primaryButton } from "../editor/layout/styles";
import { WindowBar } from "../editor/layout/WindowBar";

type ListState = { uid: string; graphs: GraphSummary[] } | { uid: string; error: true };

export function GraphsPage() {
  const { user, ready } = useAuth();
  const [list, setList] = useState<ListState | null>(null);
  // the graph being opened or deleted; every row waits until it finishes
  const [busy, setBusy] = useState<{ id: string; label: string } | null>(null);
  const navigate = useNavigate();
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return;
    let current = true;
    listGraphs(uid).then(
      (graphs) => current && setList({ uid, graphs }),
      () => current && setList({ uid, error: true }),
    );
    return () => {
      current = false;
    };
  }, [uid]);

  // a list fetched for a previous account is never shown
  const shown = list && list.uid === uid ? list : null;

  async function open(id: string) {
    setBusy({ id, label: "Loading…" });
    try {
      const graph = await loadGraph(id);
      if (!writeDraft({ title: graph.title, doc: graph.doc, graphId: graph.id, dirty: false })) {
        throw new Error("draft storage unavailable");
      }
      navigate("/");
    } catch (err) {
      setBusy(null);
      showAlert(
        "Couldn't open graph",
        err instanceof GraphNotFoundError ? err.message : "Something went wrong while loading it. Check your connection and try again.",
      );
    }
  }

  const confirmOpen = (id: string) =>
    showConfirm("Load this graph?", "It will overwrite your current canvas.", "Load", () => void open(id));

  async function remove(graph: GraphSummary) {
    setBusy({ id: graph.id, label: "Deleting…" });
    try {
      await deleteGraph(graph.id);
      forgetInEditor(graph.id);
      setList((l) => (l && "graphs" in l ? { ...l, graphs: l.graphs.filter((g) => g.id !== graph.id) } : l));
    } catch {
      showAlert("Couldn't delete graph", "Something went wrong while deleting it. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const confirmRemove = (graph: GraphSummary) =>
    showConfirm(
      "Delete this graph?",
      `"${graph.title}" will be permanently deleted. This can't be undone.`,
      "Delete",
      () => void remove(graph),
      true,
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-12">
        <section className={floatingCard}>
          <WindowBar title="My graphs" />
          <div className="p-5">
            {!ready ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : !user ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-slate-600">Sign in to see the graphs you've saved.</p>
                <button type="button" onClick={() => openAuthDialog("signIn")} className={primaryButton}>
                  Sign in
                </button>
              </div>
            ) : !shown ? (
              <p className="text-sm text-slate-500">Loading your graphs…</p>
            ) : "error" in shown ? (
              <p role="alert" className="border-l-2 border-danger bg-red-50 px-2 py-1 text-sm text-danger-strong">
                Couldn't load your graphs. Check your connection and refresh the page.
              </p>
            ) : shown.graphs.length === 0 ? (
              <p className="text-sm text-slate-600">No saved graphs yet. Use Save in the editor to keep one here.</p>
            ) : (
              <ul className="divide-y divide-slate-200 border-y border-slate-200">
                {shown.graphs.map((g) => (
                  <li key={g.id} className="flex items-center">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => confirmOpen(g.id)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 px-2 py-2 text-left text-sm hover:bg-accent-soft hover:text-accent-strong disabled:hover:bg-transparent disabled:hover:text-inherit"
                    >
                      <span className="truncate">{g.title}</span>
                      {busy?.id === g.id && <span className="shrink-0 text-xs text-slate-500">{busy.label}</span>}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => confirmRemove(g)}
                      aria-label={`Delete ${g.title}`}
                      title="Delete graph"
                      className="shrink-0 self-stretch px-2 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <img src={trashUrl} alt="" className="h-4 w-4 object-contain" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
