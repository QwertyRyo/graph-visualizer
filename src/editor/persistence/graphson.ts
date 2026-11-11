import type { GraphDoc } from "../../domain/graph/schema";

type Typed = { "@type": string; "@value": unknown };

const typed = (type: string, value: unknown): Typed => ({ "@type": type, "@value": value });
const int32 = (n: number) => typed("g:Int32", n);
const double = (n: number) => typed("g:Double", n);

// converts a graph to a tinkergraph document, ids renumbered from 0
export function toGraphSON(doc: GraphDoc): Typed {
  const vertexId = new Map(doc.nodes.map((n, i) => [n.id, i]));
  let propertyId = 0;
  const vertexProp = (label: string, value: unknown) => [
    typed("g:VertexProperty", { id: typed("g:Int64", propertyId++), value, label }),
  ];
  const edgeProp = (key: string, value: unknown) => typed("g:Property", { key, value });

  const vertices = doc.nodes.map((n, i) =>
    typed("g:Vertex", {
      id: int32(i),
      label: "vertex",
      properties: {
        name: vertexProp("name", n.label),
        color: vertexProp("color", n.color),
        isRoot: vertexProp("isRoot", n.isRoot),
        x: vertexProp("x", double(n.x)),
        y: vertexProp("y", double(n.y)),
      },
    }),
  );

  const edges = doc.edges.map((e, i) =>
    typed("g:Edge", {
      id: int32(doc.nodes.length + i),
      label: "edge",
      inVLabel: "vertex",
      outVLabel: "vertex",
      inV: int32(vertexId.get(e.target)!),
      outV: int32(vertexId.get(e.source)!),
      properties: {
        weight: edgeProp("weight", double(e.weight)),
        color: edgeProp("color", e.color),
      },
    }),
  );

  return typed("tinker:graph", { vertices, edges });
}
