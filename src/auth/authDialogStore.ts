import { create } from "zustand";

export type AuthMode = "signIn" | "signUp";

type AuthDialogState = { mode: AuthMode | null };

export const useAuthDialog = create<AuthDialogState>(() => ({ mode: null }));

export const openAuthDialog = (mode: AuthMode = "signIn") => useAuthDialog.setState({ mode });
export const closeAuthDialog = () => useAuthDialog.setState({ mode: null });
