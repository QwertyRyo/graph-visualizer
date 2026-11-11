import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("../fixtures/test_graph_1.gv", import.meta.url));
const CANVAS = "div.relative.h-full.w-full.overflow-hidden.bg-white > div.h-full";

type Host = { _cyreg: { cy: import("cytoscape").Core } };

async function selectedEdges(page: Page): Promise<number> {
  return page.evaluate((sel) => (document.querySelector(sel) as unknown as Host)._cyreg.cy.edges(":selected").length, CANVAS);
}

// returns nothing: handing a cytoscape collection back to playwright never serializes
async function selectFirstEdge(page: Page): Promise<void> {
  await page.evaluate((sel) => {
    (document.querySelector(sel) as unknown as Host)._cyreg.cy.edges()[0].select();
  }, CANVAS);
}

// screen position of the first vertex, plus its radius
async function firstVertex(page: Page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as unknown as Host & HTMLElement;
    const node = el._cyreg.cy.nodes()[0];
    const box = el.getBoundingClientRect();
    const p = node.renderedPosition();
    return { x: box.left + p.x, y: box.top + p.y, r: node.renderedWidth() / 2 };
  }, CANVAS);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.getByText("Edge Count:").locator("+ dd")).toHaveText("5");
  await page.getByRole("button", { name: /^Edge/ }).click();
  await selectFirstEdge(page);
  expect(await selectedEdges(page)).toBe(1);
});

test("starting an edge with the Edge tool deselects the selected edge", async ({ page }) => {
  const v = await firstVertex(page);
  await page.mouse.click(v.x, v.y);

  expect(await selectedEdges(page)).toBe(0);
});

test("pressing a vertex rim deselects the selected edge", async ({ page }) => {
  // leave Edge mode so the rim stub is the only way to start an edge
  await page.getByRole("button", { name: /^All/ }).click();
  await selectFirstEdge(page);
  expect(await selectedEdges(page)).toBe(1);

  const v = await firstVertex(page);
  await page.mouse.move(v.x + v.r + 40, v.y);
  await page.mouse.move(v.x + v.r, v.y, { steps: 10 });
  await page.mouse.down();
  await page.mouse.up();

  expect(await selectedEdges(page)).toBe(0);
});

test("pressing a vertex rim deselects selected vertices", async ({ page }) => {
  await page.getByRole("button", { name: /^All/ }).click();
  await page.evaluate((sel) => {
    (document.querySelector(sel) as unknown as Host)._cyreg.cy.nodes()[1].select();
  }, CANVAS);
  const selected = () =>
    page.evaluate((sel) => (document.querySelector(sel) as unknown as Host)._cyreg.cy.nodes(":selected").length, CANVAS);
  expect(await selected()).toBe(1);

  const v = await firstVertex(page);
  await page.mouse.move(v.x + v.r + 40, v.y);
  await page.mouse.move(v.x + v.r, v.y, { steps: 10 });
  await page.mouse.down();
  await page.mouse.up();

  expect(await selected()).toBe(0);
});
