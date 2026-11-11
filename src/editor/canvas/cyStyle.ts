import type { Css, EdgeSingular, StylesheetJson } from "cytoscape";
import crownUrl from "../../assets/crown.png";
import { ACCENT } from "../theme";

const EDGE_SELECTED = ACCENT;

const TINTED_CANVAS = "#eeeff0";

const FILTER_DIM_OPACITY = 0.2;
const FILTER_MATCH_WIDTH = 5;

const RUN_OPEN = ACCENT;
export const RUN_CLOSED = "#1e293b";
const RUN_UNSEEN_OPACITY = 0.35;

export const EDGE_DASH = [8, 6];

const CROWN_WIDTH = 28;
const CROWN_HEIGHT = (CROWN_WIDTH * 143) / 240;
const CROWN_OVERLAP = 3;

const MIN_NODE_SIZE = 45;
const MAX_NODE_SIZE = 120;
const BASE_FONT = 14;
const MIN_FONT = 9;
const LABEL_PADDING = 14;

export const EDGE_LABEL_FONT = 12;
export const EDGE_LABEL_PADDING = 4;

let measurer: CanvasRenderingContext2D | null = null;

// on-screen width of text in cytoscape's default font, null without a canvas
export function measureText(text: string, fontSize: number): number | null {
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return null;
  measurer.font = `${fontSize}px "Helvetica Neue", Helvetica, sans-serif`;
  return measurer.measureText(text).width;
}

// circle diameter and font that keep a label inside its vertex
export function nodeSize(label: string): { size: number; fontSize: number } {
  const text = measureText(label, BASE_FONT);
  if (text === null) return { size: MIN_NODE_SIZE, fontSize: BASE_FONT };
  const wanted = text + LABEL_PADDING;
  if (wanted <= MAX_NODE_SIZE) return { size: Math.max(MIN_NODE_SIZE, Math.ceil(wanted)), fontSize: BASE_FONT };
  const fontSize = Math.max(MIN_FONT, (BASE_FONT * (MAX_NODE_SIZE - LABEL_PADDING)) / text);
  return { size: MAX_NODE_SIZE, fontSize: Math.round(fontSize * 10) / 10 };
}

export function graphStyle(directed: boolean, weighted: boolean): StylesheetJson {
  return [
    {
      selector: "core",
      style: { "active-bg-opacity": 0 } as Css.Core,
    },
    {
      selector: "node",
      style: {
        width: "data(size)",
        height: "data(size)",
        "background-color": "data(color)",
        "border-width": 2,
        "border-color": "#475569",
      },
    },
    {
      selector: "node[label]",
      style: {
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": "data(fontSize)",
        color: "data(textColor)",
      },
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "curve-style": "bezier",
        "line-color": "data(color)",
        "target-arrow-color": "data(color)",
        "target-arrow-shape": directed ? "triangle" : "none",
      },
    },
    ...(weighted
      ? [
          {
            selector: "edge[weight]",
            style: {
              label: "data(weight)",
              "font-size": EDGE_LABEL_FONT,
              "text-background-color": "#ffffff",
              "text-background-opacity": 1,
              "text-background-padding": `${EDGE_LABEL_PADDING}px`,
              // edgeLabels.ts nudges each label clear of vertices and other labels
              "text-margin-x": (e: EdgeSingular) => e.data("labelDx") ?? 0,
              "text-margin-y": (e: EdgeSingular) => e.data("labelDy") ?? 0,
            },
          },
        ]
      : []),
    {
      selector: "node[?isRoot]",
      style: {
        "background-image": crownUrl,
        "background-fit": "none",
        "background-width": CROWN_WIDTH,
        "background-height": CROWN_HEIGHT,
        "background-position-x": "50%",
        "background-position-y": -(CROWN_HEIGHT - CROWN_OVERLAP),
        "background-clip": "none",
        "background-image-containment": "over",
        "bounds-expansion": [CROWN_HEIGHT, 0, 0, 0],
      },
    },
    {
      selector: "edge:selected",
      style: {
        width: 3,
        "line-color": "data(color)",
        "line-style": "dashed",
        "line-dash-pattern": EDGE_DASH,
        "arrow-scale": 1.3,
        "source-arrow-shape": "circle",
        "source-arrow-color": "data(color)",
        "target-arrow-shape": directed ? "triangle" : "circle",
        "target-arrow-color": "data(color)",
      },
    },
    {
      selector: "edge.ep-dragging",
      style: { opacity: 0.25 },
    },
    {
      selector: "node.ep-ghost",
      style: { width: 1, height: 1, opacity: 0, events: "no" },
    },
    {
      selector: "edge.ep-preview",
      style: {
        width: 3,
        "line-color": EDGE_SELECTED,
        "line-style": "dashed",
        "line-dash-pattern": EDGE_DASH,
        "target-arrow-shape": directed ? "triangle" : "none",
        "target-arrow-color": EDGE_SELECTED,
        events: "no",
      },
    },
    {
      selector: "node.ep-hover",
      style: { "border-color": EDGE_SELECTED, "border-width": 3 },
    },
    {
      selector: "node.edge-source",
      style: {
        "border-color": "data(ring)",
        "border-width": 3,
        "border-style": "dashed",
        "underlay-color": "data(ring)",
        "underlay-opacity": 0.2,
        "underlay-padding": 6,
        "underlay-shape": "ellipse",
      },
    },
    {
      selector: "node.rim-target",
      style: {
        "border-color": "data(ring)",
        "border-width": 3,
        "underlay-color": "data(ring)",
        "underlay-opacity": 0.2,
        "underlay-padding": 6,
        "underlay-shape": "ellipse",
      },
    },
    {
      selector: ".eh-preview, .eh-ghost-edge",
      style: { "line-color": ACCENT, "target-arrow-color": ACCENT, "line-style": "dashed" },
    },
    {
      selector: ".eh-ghost-edge.eh-preview-active",
      style: { opacity: 0 },
    },
    {
      selector: ".filter-dim",
      style: { opacity: FILTER_DIM_OPACITY },
    },
    {
      selector: "edge.on-tint",
      style: { "text-background-color": TINTED_CANVAS },
    },
    {
      selector: "edge.filter-match",
      style: { width: FILTER_MATCH_WIDTH, "arrow-scale": 1.2 },
    },
    {
      selector: ".run-unseen",
      style: { opacity: RUN_UNSEEN_OPACITY },
    },
    {
      selector: "node.run-open",
      style: { "border-color": RUN_OPEN, "border-width": 3 },
    },
    {
      selector: "node.run-closed",
      style: { "border-color": RUN_CLOSED, "border-width": 3 },
    },
    {
      selector: "edge.run-tree",
      style: { width: FILTER_MATCH_WIDTH, "arrow-scale": 1.2 },
    },
    {
      selector: "edge.run-back",
      style: { width: 3, "line-style": "dashed", "line-dash-pattern": EDGE_DASH },
    },
    {
      selector: "node.run-current",
      style: {
        "border-color": RUN_OPEN,
        "border-width": 4,
        "underlay-color": RUN_OPEN,
        "underlay-opacity": 0.25,
        "underlay-padding": 8,
        "underlay-shape": "ellipse",
      },
    },
    {
      selector: "edge.run-current",
      style: { width: FILTER_MATCH_WIDTH, "line-color": RUN_OPEN, "target-arrow-color": RUN_OPEN, "arrow-scale": 1.2 },
    },
  ];
}
