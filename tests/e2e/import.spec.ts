import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
const test_graphs = ["test_graph_1.gv", "test_graph_1.graphml"];
const DRAFT_KEY = "graph-visualizer:draft";

type Doc = {
  directed: boolean;
  weighted: boolean;
  nodes: { id: string; label: string; x: number; y: number }[];
  edges: { source: string; target: string; weight: number }[];
};

async function savedDraft(page: Page): Promise<{ title: string; doc: Doc }> {
  const handle = await page.waitForFunction((key) => localStorage.getItem(key), DRAFT_KEY);
  return JSON.parse((await handle.jsonValue()) as string);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

for (const file of test_graphs) {
  test(`imports the social network from ${file}`, async ({ page }) => {
    await page.locator('input[type="file"]').setInputFiles(fixture(file));

    await expect(page.getByLabel("Graph title")).toHaveValue("SocialNetwork");
    await expect(page.getByText("Vertex Count:").locator("+ dd")).toHaveText("4");
    await expect(page.getByText("Edge Count:").locator("+ dd")).toHaveText("5");
    await expect(page.getByRole("checkbox", { name: "Directed" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Weighted" })).not.toBeChecked();

    const { title, doc } = await savedDraft(page);
    expect(title).toBe("SocialNetwork");
    expect(doc.directed).toBe(false);
    expect(doc.weighted).toBe(false);

    const labels = doc.nodes.map((n) => n.label).sort();
    expect(labels).toEqual(["Alice", "Bob", "Charlie", "David"]);

    const name = new Map(doc.nodes.map((n) => [n.id, n.label]));
    const pairs = doc.edges.map((e) => [name.get(e.source), name.get(e.target)].sort().join("-")).sort();
    expect(pairs).toEqual(["Alice-Bob", "Alice-Charlie", "Bob-Charlie", "Bob-David", "Charlie-David"]);

    for (const e of doc.edges) expect(e.weight).toBe(1);

    const spots = new Set(doc.nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`));
    expect(spots.size).toBe(doc.nodes.length);
  });
}

test("exported graphml imports back with its settings", async ({ page, browser }) => {
  await page.locator('input[type="file"]').setInputFiles(fixture("test_graph_1.gv"));
  await page.getByRole("checkbox", { name: "Weighted" }).check();
  await page.getByRole("checkbox", { name: "Directed" }).check();

  await page.getByRole("button", { name: "Export" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "GraphML (.graphml)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("SocialNetwork.graphml");

  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.goto("/");
  await expect(fresh.getByText("Vertex Count:").locator("+ dd")).toHaveText("0");
  await fresh.locator('input[type="file"]').setInputFiles(await file.path());

  await expect(fresh.getByLabel("Graph title")).toHaveValue("SocialNetwork");
  await expect(fresh.getByText("Vertex Count:").locator("+ dd")).toHaveText("4");
  await expect(fresh.getByText("Edge Count:").locator("+ dd")).toHaveText("5");
  await expect(fresh.getByRole("checkbox", { name: "Directed" })).toBeChecked();
  await expect(fresh.getByRole("checkbox", { name: "Weighted" })).toBeChecked();
  await context.close();
});

test("a broken graphml file shows an error and keeps the graph", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(fixture("test_graph_1.gv"));
  await expect(page.getByText("Vertex Count:").locator("+ dd")).toHaveText("4");

  await page.locator('input[type="file"]').setInputFiles({
    name: "broken.graphml",
    mimeType: "application/xml",
    buffer: Buffer.from("<graphml><graph><node id='a'></graph></graphml>"),
  });
  await expect(page.getByText(/That GraphML file couldn't be read/)).toBeVisible();
  await expect(page.getByText("Vertex Count:").locator("+ dd")).toHaveText("4");
});
