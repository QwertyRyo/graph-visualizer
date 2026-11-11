import { create } from "zustand";

// with confirm set, the dialog shows Cancel and a button that runs onConfirm
type Confirm = { label: string; onConfirm: () => void; danger?: boolean };
type Alert = { title: string; message: string; confirm?: Confirm };

type AlertState = {
  alert: Alert | null;
  showAlert: (title: string, message: string) => void;
  closeAlert: () => void;
};

export const useAlertStore = create<AlertState>()((set) => ({
  alert: null,
  showAlert: (title, message) => set({ alert: { title, message } }),
  closeAlert: () => set({ alert: null }),
}));

export const showAlert = (title: string, message: string) => useAlertStore.getState().showAlert(title, message);

export const showConfirm = (title: string, message: string, label: string, onConfirm: () => void, danger = false) =>
  useAlertStore.setState({ alert: { title, message, confirm: { label, onConfirm, danger } } });
