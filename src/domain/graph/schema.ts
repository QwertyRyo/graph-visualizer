import * as z from "zod";
import { alignIds, detectIndexMode, INDEX_MODES, type IndexMode } from "./indexing";

export const MAX_NODES = 100;

export const MAX_EDGES = MAX_NODES * MAX_NODES;

export const MAX_LABEL_LENGTH = 20;

export const DEFAULT_NODE_COLOR = "#fb923c";
export const DEFAULT_EDGE_COLOR = "#94a3b8";
export const DEFAULT_EDGE_WEIGHT = 1;

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const NodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(MAX_LABEL_LENGTH),
  x: z.number(),
  y: z.number(),
  color: Color.default(DEFAULT_NODE_COLOR),
  isRoot: z.boolean().default(false),
});

const EdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  weight: z.number().default(DEFAULT_EDGE_WEIGHT),
  color: Color.default(DEFAULT_EDGE_COLOR),
});

export const GraphDocSchema = z
  .object({
    version: z.literal(1),
    directed: z.boolean(),
    weighted: z.boolean(),
    indexMode: z.enum(INDEX_MODES).optional(),
    nodes: z.array(NodeSchema).max(MAX_NODES),
    edges: z.array(EdgeSchema).max(MAX_EDGES),
  })
  .superRefine((doc, ctx) => {
    const roots = doc.nodes.filter((n) => n.isRoot).length;
    if (roots > 1) {
      ctx.addIssue({ code: "custom", message: "At most one root node", path: ["nodes"] });
    }

    const nodeIds = new Set<string>();
    const labels = new Set<string>();
    doc.nodes.forEach((n, i) => {
      if (labels.has(n.label)) {
        ctx.addIssue({ code: "custom", message: `Duplicate node label "${n.label}"`, path: ["nodes", i, "label"] });
      }
      labels.add(n.label);
      if (nodeIds.has(n.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate node id "${n.id}"`,
          path: ["nodes", i, "id"],
        });
      }
      nodeIds.add(n.id);
    });

    const edgeIds = new Set<string>();
    doc.edges.forEach((e, i) => {
      if (edgeIds.has(e.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate edge id "${e.id}"`,
          path: ["edges", i, "id"],
        });
      }
      edgeIds.add(e.id);

      if (e.source === e.target) {
        ctx.addIssue({ code: "custom", message: "Self-edges are not allowed", path: ["edges", i] });
      }

      for (const end of ["source", "target"] as const) {
        if (!nodeIds.has(e[end])) {
          ctx.addIssue({
            code: "custom",
            message: `Edge references missing node "${e[end]}"`,
            path: ["edges", i, end],
          });
        }
      }
    });
  });

export type GraphDoc = Omit<z.infer<typeof GraphDocSchema>, "indexMode"> & { indexMode: IndexMode };
export type GraphNode = GraphDoc["nodes"][number];
export type GraphEdge = GraphDoc["edges"][number];

export function emptyGraph(): GraphDoc {
  return { version: 1, directed: false, weighted: false, indexMode: "alpha", nodes: [], edges: [] };
}

// validates, then gives older random vertex ids integer ones
export function parseGraphDoc(data: unknown): GraphDoc {
  const parsed = GraphDocSchema.parse(data);
  const indexMode = parsed.indexMode ?? detectIndexMode(parsed.nodes);
  const { nodes, edges } = alignIds(parsed.nodes, parsed.edges);
  return { ...parsed, nodes, edges, indexMode };
}
