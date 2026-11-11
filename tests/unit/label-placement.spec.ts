import { expect, test } from "@playwright/test";
import {
  boxAround,
  candidateOffsets,
  edgePath,
  overlapArea,
  pathLength,
  placeLabels,
  pointAlong,
  type LabelRequest,
  type Point,
} from "../../src/editor/canvas/labelPlacement";

const W = 20;
const H = 16;

function request(id: string, path: Point[]): LabelRequest {
  return { id, mid: pointAlong(path, 0.5), path, width: W, height: H };
}

// distance from p to the nearest point of the polyline
function distanceToPath(p: Point, path: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y))));
  }
  return best;
}

test("overlapArea is zero for touching boxes and the shared area otherwise", () => {
  const a = { x1: 0, y1: 0, x2: 10, y2: 10 };
  expect(overlapArea(a, { x1: 10, y1: 0, x2: 20, y2: 10 })).toBe(0);
  expect(overlapArea(a, { x1: 5, y1: 5, x2: 15, y2: 15 })).toBe(25);
});

test("pointAlong walks the path by distance", () => {
  const path = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  expect(pathLength(path)).toBe(200);
  expect(pointAlong(path, 0.25)).toEqual({ x: 50, y: 0 });
  expect(pointAlong(path, 0.75)).toEqual({ x: 100, y: 50 });
});

test("a curved edge passes through its quadratic midpoint", () => {
  // control point at (50, 100) puts the curve's middle at (50, 50)
  const path = edgePath({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: 50, y: 100 }]);
  const mid = pointAlong(path, 0.5);
  expect(mid.x).toBeCloseTo(50, 1);
  expect(mid.y).toBeCloseTo(50, 1);
});

test("every candidate on a straight edge stays on the line", () => {
  const req = request("e", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  const offsets = candidateOffsets(req);
  expect(offsets[0]).toEqual({ x: 0, y: 0 });
  for (const o of offsets) expect(o.y).toBe(0);
});

test("every candidate on a curved edge stays on the curve", () => {
  const path = edgePath({ x: 0, y: 0 }, { x: 200, y: 0 }, [{ x: 100, y: 80 }]);
  const req = request("e", path);
  for (const o of candidateOffsets(req)) {
    expect(distanceToPath({ x: req.mid.x + o.x, y: req.mid.y + o.y }, path)).toBeLessThan(1e-6);
  }
});

test("candidates grow farther from the midpoint", () => {
  const dist = candidateOffsets(request("e", [{ x: 0, y: 0 }, { x: 100, y: 0 }])).map((o) => Math.hypot(o.x, o.y));
  for (let i = 1; i < dist.length; i++) expect(dist[i]).toBeGreaterThanOrEqual(dist[i - 1] - 1e-9);
});

test("clear label stays on the midpoint", () => {
  const offsets = placeLabels([request("e", [{ x: 0, y: 0 }, { x: 200, y: 0 }])], []);
  expect(offsets.get("e")).toEqual({ x: 0, y: 0 });
});

test("label slides along its edge off a vertex covering the midpoint", () => {
  const vertex = boxAround({ x: 100, y: 0 }, 30, 30);
  const req = request("e", [{ x: 0, y: 0 }, { x: 200, y: 0 }]);
  const o = placeLabels([req], [vertex]).get("e")!;
  expect(o.y).toBe(0);
  const box = boxAround({ x: req.mid.x + o.x, y: req.mid.y + o.y }, W, H);
  expect(overlapArea(box, vertex)).toBe(0);
});

test("two crossing edges with the same midpoint end up apart", () => {
  const a = request("a", [{ x: -100, y: 0 }, { x: 100, y: 0 }]);
  const b = request("b", [{ x: 0, y: -100 }, { x: 0, y: 100 }]);
  const offsets = placeLabels([a, b], []);
  const oa = offsets.get("a")!;
  const ob = offsets.get("b")!;
  expect(oa.y).toBe(0);
  expect(ob.x).toBe(0);
  expect(overlapArea(boxAround(oa, W, H), boxAround(ob, W, H))).toBe(0);
});

test("with no clear spot, the least-overlapping one wins", () => {
  // a wall covering every candidate
  const wall = { x1: -1000, y1: -1000, x2: 1000, y2: 1000 };
  const offsets = placeLabels([request("e", [{ x: 0, y: 0 }, { x: 200, y: 0 }])], [wall]);
  expect(offsets.get("e")).toEqual({ x: 0, y: 0 });
});
