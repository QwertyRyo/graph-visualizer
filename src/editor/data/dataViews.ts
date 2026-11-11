export const DATA_VIEWS = [
  { id: "matrix", label: "Adjacency matrix" },
  { id: "list", label: "Adjacency list" },
  { id: "schedule", label: "Scheduling table" },
] as const;

export type DataViewId = (typeof DATA_VIEWS)[number]["id"];

export const MENU_DATA_VIEWS = DATA_VIEWS.filter((v) => v.id !== "schedule");
