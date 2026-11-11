import { expect, test } from "@playwright/test";
import { addNode } from "../../src/domain/graph/ops";
import { emptyGraph } from "../../src/domain/graph/schema";
import { MAX_HISTORY, useEditorStore } from "../../src/editor/store";

const store = () => useEditorStore.getState();
const add = () => store().commit((d) => addNode(d, { x: 0, y: 0 }));

test.beforeEach(() => {
  store().load(emptyGraph(), "test");
});

test.describe("editor store", () => {
  test("commit pushes history and marks dirty", () => {
    add();
    expect(store().doc.nodes).toHaveLength(1);
    expect(store().past).toHaveLength(1);
    expect(store().dirty).toBe(true);
  });

  test("ignores edits that return the same doc", () => {
    store().commit((d) => d);
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
  });

  test("undo and redo move between past and future", () => {
    add();
    add();
    store().undo();
    expect(store().doc.nodes).toHaveLength(1);
    store().undo();
    expect(store().doc.nodes).toHaveLength(0);
    store().redo();
    store().redo();
    expect(store().doc.nodes).toHaveLength(2);
    expect(store().future).toHaveLength(0);
  });

  test("a new edit clears the redo stack", () => {
    add();
    store().undo();
    add();
    expect(store().future).toHaveLength(0);
  });

  test("undo and redo do nothing at the ends", () => {
    const before = store();
    store().undo();
    store().redo();
    expect(store().doc).toBe(before.doc);
  });

  test("keeps at most max history undo steps", () => {
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      store().commit((d) => ({ ...d, nodes: [] }));
    }
    expect(store().past).toHaveLength(MAX_HISTORY);
  });

  test("replaceDoc is one undoable step", () => {
    add();
    store().replaceDoc(emptyGraph());
    expect(store().doc.nodes).toHaveLength(0);
    store().undo();
    expect(store().doc.nodes).toHaveLength(1);
  });

  test("drops selected ids that no longer exist", () => {
    add();
    const id = store().doc.nodes[0].id;
    store().setSelection({ nodes: [id], edges: [] });
    store().undo();
    expect(store().selection.nodes).toEqual([]);
  });

  test("load resets history and dirty", () => {
    add();
    store().load(emptyGraph(), "fresh");
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
    expect(store().title).toBe("fresh");
  });
});
