import type { Tool } from "../store";

export const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: "select", label: "All", key: "Q" },
  { tool: "node", label: "Vertex", key: "V" },
  { tool: "edge", label: "Edge", key: "E" },
];

export function toolForKey(key: string): Tool | undefined {
  return TOOLS.find((t) => t.key.toLowerCase() === key.toLowerCase())?.tool;
}
