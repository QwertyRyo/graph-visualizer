import { create } from "zustand";
import { openAuthDialog, useAuthDialog } from "../../auth/authDialogStore";
import { useAuth } from "../../data/auth";
import { createGraph, GraphNotFoundError, GraphTooLargeError, saveGraph } from "../../data/graphs";
import { showAlert } from "../dialog/alertStore";
import { useEditorStore } from "../store";

export const useSaveStatus = create<{ saving: boolean }>(() => ({ saving: false }));

let pending = false;

// signing in from a Save click finishes that save; closing the dialog drops it
useAuth.subscribe((s, prev) => {
  if (s.user && !prev.user && pending) {
    pending = false;
    void saveToCloud();
  }
});
useAuthDialog.subscribe((s) => {
  if (s.mode === null) pending = false;
});

// updates the graph being edited, or creates it the first time
export async function saveToCloud(): Promise<void> {
  const user = useAuth.getState().user;
  if (!user) {
    openAuthDialog("signIn");
    pending = true;
    return;
  }
  if (useSaveStatus.getState().saving) return;

  const { doc, title, graphId, markSaved } = useEditorStore.getState();
  useSaveStatus.setState({ saving: true });
  try {
    let id = graphId;
    if (id) {
      try {
        await saveGraph(id, title, doc);
      } catch (err) {
        // deleted, or saved by a different account: save it as a new graph instead
        if (!(err instanceof GraphNotFoundError)) throw err;
        id = null;
      }
    }
    if (!id) id = await createGraph(user.uid, title, doc);
    markSaved(id, { doc, title });
  } catch (err) {
    showAlert(
      "Couldn't save",
      err instanceof GraphTooLargeError ? err.message : "Something went wrong while saving. Check your connection and try again.",
    );
  } finally {
    useSaveStatus.setState({ saving: false });
  }
}
