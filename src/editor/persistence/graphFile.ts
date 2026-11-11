import { parseGraphDoc, type GraphDoc } from "../../domain/graph/schema";
import { fromDot, toDot } from "./dot";
import { fromGraphML, toGraphML } from "./graphml";
import { toGraphSON } from "./graphson";

export type ExportFormat = "gv" | "json" | "graphml";

function fileName(title: string, ext: ExportFormat): string {
  const safe = title.trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "graph"}.${ext}`;
}

const WRITERS: Record<ExportFormat, { type: string; write: (doc: GraphDoc, title: string) => string }> = {
  gv: { type: "text/vnd.graphviz", write: toDot },
  json: { type: "application/json", write: (doc) => JSON.stringify(toGraphSON(doc), null, 2) },
  graphml: { type: "application/graphml+xml", write: toGraphML },
};

// .gv is graphviz dot, .json is graphson 3.0, .graphml is xml
export function exportGraph(doc: GraphDoc, title: string, format: ExportFormat): void {
  const { type, write } = WRITERS[format];
  const text = write(doc, title);
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName(title, format);
  link.click();
  URL.revokeObjectURL(url);
}

export class GraphSONImportError extends Error {}

// throws if the file is not a valid graph
export async function readGraphFile(file: File): Promise<{ doc: GraphDoc; title?: string }> {
  const text = (await file.text()).trimStart();
  if (text.startsWith("<")) return fromGraphML(text);
  if (text.startsWith("{")) {
    const data = JSON.parse(text);
    if (data && typeof data === "object" && "@type" in data) throw new GraphSONImportError();
    return { doc: parseGraphDoc(data) };
  }
  return fromDot(text);
}
