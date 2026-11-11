import type { Core } from "cytoscape";
import { create } from "zustand";

type CanvasRegistry = {
  canvases: Core[];
  active: Core | null;
  register: (cy: Core) => void;
  unregister: (cy: Core) => void;
  activate: (cy: Core) => void;
};

export const useCanvasRegistry = create<CanvasRegistry>()((set) => ({
  canvases: [],
  active: null,
  register: (cy) => set((s) => ({ canvases: [...s.canvases, cy], active: s.active ?? cy })),
  unregister: (cy) =>
    set((s) => {
      const canvases = s.canvases.filter((c) => c !== cy);
      return { canvases, active: s.active === cy ? (canvases[0] ?? null) : s.active };
    }),
  activate: (cy) => set({ active: cy }),
}));
