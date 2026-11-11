import { expect, test } from "@playwright/test";
import { addEdge, addNode, relabelNode, setColor, setRoot, setWeight } from "../../src/domain/graph/ops";
import { emptyGraph, type GraphDoc } from "../../src/domain/graph/schema";
import { fromGraphML, GraphMLImportError, toGraphML } from "../../src/editor/persistence/graphml";
import { parseXml, XmlError } from "../../src/editor/persistence/xml";

const HEAD = `<?xml version="1.0" encoding="UTF-8"?>\n<graphml xmlns="http://graphml.graphdrawing.org/xmlns">`;

function sample(): GraphDoc {
  let doc: GraphDoc = { ...emptyGraph(), directed: true, weighted: true };
  doc = addNode(doc, { x: 10, y: -20 });
  doc = addNode(doc, { x: 30.5, y: 40 });
  doc = addNode(doc, { x: 0, y: 0 });
  const [a, b, c] = doc.nodes.map((n) => n.id);
  doc = relabelNode(doc, a, `<A & "B">`);
  doc = setRoot(doc, b, true);
  doc = setColor(doc, { nodes: [c], edges: [] }, "#ff0000");
  doc = addEdge(doc, a, b);
  doc = addEdge(doc, b, c);
  doc = setWeight(doc, doc.edges[0].id, 2.5);
  doc = setColor(doc, { nodes: [], edges: [doc.edges[1].id] }, "#00ff00");
  return doc;
}

// compare by label, since import mints new ids
function shape(doc: GraphDoc) {
  const label = new Map(doc.nodes.map((n) => [n.id, n.label]));
  return {
    directed: doc.directed,
    weighted: doc.weighted,
    nodes: doc.nodes.map(({ label, x, y, color, isRoot }) => ({ label, x, y, color, isRoot })),
    edges: doc.edges.map((e) => ({ s: label.get(e.source), t: label.get(e.target), weight: e.weight, color: e.color })),
  };
}

test.describe("parseXml", () => {
  test("reads elements, attributes, text, entities and cdata", () => {
    const el = parseXml(`<?xml version="1.0"?><!-- c --><!DOCTYPE x><a b='1' c="&lt;&#65;&#x42;"><y:d/>t&amp;<![CDATA[<raw>]]></a>`);
    expect(el.name).toBe("a");
    expect(el.attrs).toEqual({ b: "1", c: "<AB" });
    expect(el.children.map((c) => c.name)).toEqual(["d"]);
    expect(el.text).toBe("t&<raw>");
  });

  test("rejects malformed xml", () => {
    expect(() => parseXml("<a><b></a>")).toThrow(XmlError);
    expect(() => parseXml("<a>")).toThrow(XmlError);
    expect(() => parseXml("<a/><b/>")).toThrow(XmlError);
    expect(() => parseXml("<a <b>")).toThrow(XmlError);
  });
});

test.describe("toGraphML / fromGraphML", () => {
  test("writes valid graphml with declared keys", () => {
    const xml = toGraphML(sample(), "My graph");
    const root = parseXml(xml);
    expect(root.name).toBe("graphml");
    expect(root.attrs.xmlns).toBe("http://graphml.graphdrawing.org/xmlns");
    const graph = root.children.find((c) => c.name === "graph")!;
    expect(graph.attrs.edgedefault).toBe("directed");
    const declared = new Set(root.children.filter((c) => c.name === "key").map((k) => k.attrs.id));
    const used = xml.match(/key="[^"]+"/g)!.map((m) => m.slice(5, -1));
    for (const k of used) expect(declared.has(k)).toBe(true);
    expect(xml).toContain("&lt;A &amp; &quot;B&quot;&gt;");
  });

  test("round trips everything the editor stores", () => {
    const doc = sample();
    const back = fromGraphML(toGraphML(doc, "My graph"));
    expect(back.title).toBe("My graph");
    expect(shape(back.doc)).toEqual(shape(doc));
  });

  test("round trips an unweighted undirected graph", () => {
    const doc = { ...sample(), directed: false, weighted: false };
    const back = fromGraphML(toGraphML(doc, "t"));
    expect(back.doc.directed).toBe(false);
    expect(back.doc.weighted).toBe(false);
    expect(back.doc.edges.map((e) => e.weight)).toEqual([2.5, 1]);
  });
});

test.describe("fromGraphML with other tools' files", () => {
  test("reads networkx style keys and ignores text labels as weights", () => {
    const { doc, title } = fromGraphML(`${HEAD}
      <key id="d0" for="node" attr.name="name" attr.type="string"/>
      <key id="d1" for="edge" attr.name="weight" attr.type="double"><default>3</default></key>
      <key id="d2" for="edge" attr.name="label" attr.type="string"/>
      <graph id="Social" edgedefault="undirected">
        <node id="a"><data key="d0">Alice</data></node>
        <node id="b"><data key="d0">Bob</data></node>
        <node id="c"/>
        <edge source="a" target="b"><data key="d2">Friend</data></edge>
        <edge source="b" target="c"><data key="d1">0.5</data></edge>
        <edge source="c" target="c"/>
        <edge source="b" target="a"/>
        <edge source="a" target="missing"/>
      </graph></graphml>`);
    expect(title).toBe("Social");
    expect(doc.directed).toBe(false);
    expect(doc.weighted).toBe(true);
    expect(doc.nodes.map((n) => n.label)).toEqual(["Alice", "Bob", "c"]);
    expect(doc.edges).toHaveLength(2);
    expect(doc.edges.map((e) => e.weight)).toEqual([3, 0.5]);
  });

  test("treats non-numeric weights as missing", () => {
    const { doc } = fromGraphML(`${HEAD}
      <key id="w" for="edge" attr.name="weight" attr.type="string"/>
      <graph edgedefault="directed">
        <node id="a"/><node id="b"/>
        <edge source="a" target="b"><data key="w">Colleague</data></edge>
      </graph></graphml>`);
    expect(doc.directed).toBe(true);
    expect(doc.weighted).toBe(false);
    expect(doc.edges[0].weight).toBe(1);
  });

  test("reads gephi rgb colors and per-edge direction", () => {
    const { doc } = fromGraphML(`${HEAD}
      <key id="r" for="node" attr.name="r" attr.type="int"/>
      <key id="g" for="node" attr.name="g" attr.type="int"/>
      <key id="b" for="node" attr.name="b" attr.type="int"/>
      <graph edgedefault="undirected">
        <node id="a"><data key="r">255</data><data key="g">128</data><data key="b">0</data></node>
        <node id="b"/>
        <edge source="a" target="b" directed="true"/>
      </graph></graphml>`);
    expect(doc.nodes[0].color).toBe("#ff8000");
    expect(doc.directed).toBe(true);
  });

  test("reads yed labels, geometry centers and colors", () => {
    const { doc } = fromGraphML(`${HEAD.replace('graphml">', 'graphml" xmlns:y="http://www.yworks.com/xml/graphml">')}
      <key id="d6" for="node" yfiles.type="nodegraphics"/>
      <key id="d10" for="edge" yfiles.type="edgegraphics"/>
      <graph id="G" edgedefault="directed">
        <node id="n0"><data key="d6"><y:ShapeNode>
          <y:Geometry x="10" y="20" width="30" height="40"/><y:Fill color="#FFCC00FF"/>
          <y:NodeLabel>Start</y:NodeLabel></y:ShapeNode></data></node>
        <node id="n1"><data key="d6"><y:ShapeNode><y:NodeLabel>End</y:NodeLabel></y:ShapeNode></data></node>
        <edge source="n0" target="n1"><data key="d10"><y:PolyLineEdge>
          <y:LineStyle color="#123456" width="1"/><y:EdgeLabel>7</y:EdgeLabel></y:PolyLineEdge></data></edge>
      </graph></graphml>`);
    expect(doc.nodes.map((n) => n.label)).toEqual(["Start", "End"]);
    expect(doc.nodes[0]).toMatchObject({ x: 25, y: 40, color: "#ffcc00" });
    expect(doc.edges[0].color).toBe("#123456");
    expect(doc.weighted).toBe(false);
  });

  test("flattens nested graphs and makes labels unique and short", () => {
    const { doc } = fromGraphML(`${HEAD}
      <key id="l" for="node" attr.name="label" attr.type="string"/>
      <graph edgedefault="undirected">
        <node id="a"><data key="l">Same</data></node>
        <node id="group"><data key="l">An extremely long vertex label</data>
          <graph edgedefault="undirected"><node id="inner"><data key="l">Same</data></node></graph>
        </node>
        <edge source="a" target="inner"/>
      </graph></graphml>`);
    expect(doc.nodes.map((n) => n.label)).toEqual(["Same", "An extremely long ve", "Same 2"]);
    expect(doc.edges).toHaveLength(1);
  });

  test("keeps only the first root", () => {
    const { doc } = fromGraphML(`${HEAD}
      <key id="r" for="node" attr.name="isRoot" attr.type="boolean"/>
      <graph edgedefault="undirected">
        <node id="a"><data key="r">true</data></node><node id="b"><data key="r">true</data></node>
      </graph></graphml>`);
    expect(doc.nodes.map((n) => n.isRoot)).toEqual([true, false]);
  });

  test("rejects files that are not graphml", () => {
    expect(() => fromGraphML("<svg/>")).toThrow(GraphMLImportError);
    expect(() => fromGraphML(`${HEAD}</graphml>`)).toThrow(GraphMLImportError);
    expect(() => fromGraphML("<graphml><graph>")).toThrow(GraphMLImportError);
  });
});
