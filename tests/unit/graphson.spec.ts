import { expect, test } from "@playwright/test";
import { addEdge, addNode, setRoot, setWeight } from "../../src/domain/graph/ops";
import { emptyGraph, type GraphDoc } from "../../src/domain/graph/schema";
import { toGraphSON } from "../../src/editor/persistence/graphson";

test.describe("toGraphSON", () => {
  test("writes a tinkergraph with typed vertices and edges", () => {
    let doc: GraphDoc = emptyGraph();
    doc = addNode(doc, { x: 10, y: 20 });
    doc = addNode(doc, { x: 30, y: 40 });
    const [a, b] = doc.nodes.map((n) => n.id);
    doc = setRoot(doc, a, true);
    doc = addEdge(doc, a, b);
    doc = setWeight(doc, doc.edges[0].id, 2.5);

    const out = JSON.parse(JSON.stringify(toGraphSON(doc)));
    expect(out["@type"]).toBe("tinker:graph");
    const [va, vb] = out["@value"].vertices;
    expect(va["@type"]).toBe("g:Vertex");
    expect(va["@value"].id).toEqual({ "@type": "g:Int32", "@value": 0 });
    expect(va["@value"].properties.name[0]).toEqual({
      "@type": "g:VertexProperty",
      "@value": { id: { "@type": "g:Int64", "@value": 0 }, value: "A", label: "name" },
    });
    expect(va["@value"].properties.isRoot[0]["@value"].value).toBe(true);
    expect(vb["@value"].properties.x[0]["@value"].value).toEqual({ "@type": "g:Double", "@value": 30 });

    const [edge] = out["@value"].edges;
    expect(edge["@value"]).toMatchObject({
      id: { "@type": "g:Int32", "@value": 2 },
      outV: { "@type": "g:Int32", "@value": 0 },
      inV: { "@type": "g:Int32", "@value": 1 },
    });
    expect(edge["@value"].properties.weight).toEqual({
      "@type": "g:Property",
      "@value": { key: "weight", value: { "@type": "g:Double", "@value": 2.5 } },
    });
  });

  test("writes an empty graph", () => {
    expect(toGraphSON(emptyGraph())).toEqual({ "@type": "tinker:graph", "@value": { vertices: [], edges: [] } });
  });
});
