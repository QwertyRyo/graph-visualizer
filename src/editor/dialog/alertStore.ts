import { create } from "zustand";

type Alert = { title: string; message: string };

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
