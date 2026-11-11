export type Point = { x: number; y: number };
export type Box = { x1: number; y1: number; x2: number; y2: number };

export type LabelRequest = {
  id: string;
  mid: Point;
  path: Point[];
  width: number;
  height: number;
};

const MAX_SLIDE = 0.55;
const SLIDE_STEP = 0.05;
const DISTANCE_WEIGHT = 0.01;
const CURVE_SAMPLES = 24;

export function boxAround(c: Point, width: number, height: number): Box {
  return { x1: c.x - width / 2, y1: c.y - height / 2, x2: c.x + width / 2, y2: c.y + height / 2 };
}

export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && h > 0 ? w * h : 0;
}

const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// flattens an edge the way cytoscape draws a bezier: a straight line with no
// control points, otherwise quadratic pieces joined halfway between control points
export function edgePath(source: Point, target: Point, controls: readonly Point[] = []): Point[] {
  if (controls.length === 0) return [source, target];
  const path: Point[] = [source];
  for (let i = 0; i < controls.length; i++) {
    const start = i === 0 ? source : lerp(controls[i - 1], controls[i], 0.5);
    const end = i === controls.length - 1 ? target : lerp(controls[i], controls[i + 1], 0.5);
    const c = controls[i];
    for (let s = 1; s <= CURVE_SAMPLES; s++) {
      const t = s / CURVE_SAMPLES;
      const u = 1 - t;
      path.push({
        x: u * u * start.x + 2 * u * t * c.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * c.y + t * t * end.y,
      });
    }
  }
  return path;
}

export function pathLength(path: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return total;
}

// the point a given share of the way along the path, by distance travelled
export function pointAlong(path: readonly Point[], share: number): Point {
  const goal = pathLength(path) * share;
  let travelled = 0;
  for (let i = 1; i < path.length; i++) {
    const step = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    if (step > 0 && travelled + step >= goal) return lerp(path[i - 1], path[i], (goal - travelled) / step);
    travelled += step;
  }
  return path[path.length - 1];
}

// offsets from the midpoint that keep the label on its edge, nearest first
export function candidateOffsets(req: LabelRequest): Point[] {
  const offsets: Point[] = [{ x: 0, y: 0 }];
  const steps = Math.round(MAX_SLIDE / SLIDE_STEP);
  for (let k = 1; k <= steps; k++) {
    for (const share of [0.5 - k * SLIDE_STEP, 0.5 + k * SLIDE_STEP]) {
      const p = pointAlong(req.path, share);
      offsets.push({ x: p.x - req.mid.x, y: p.y - req.mid.y });
    }
  }
  return offsets;
}

// greedy: short edges choose first, since they have the fewest free spots
export function placeLabels(requests: readonly LabelRequest[], obstacles: readonly Box[]): Map<string, Point> {
  const order = requests
    .map((req) => ({ req, length: pathLength(req.path) }))
    .sort((a, b) => a.length - b.length)
    .map(({ req }) => req);
  const placed: Box[] = [];
  const result = new Map<string, Point>();

  for (const req of order) {
    let best: { offset: Point; box: Box; score: number } | null = null;
    for (const offset of candidateOffsets(req)) {
      const box = boxAround({ x: req.mid.x + offset.x, y: req.mid.y + offset.y }, req.width, req.height);
      let overlap = 0;
      for (const o of obstacles) overlap += overlapArea(box, o);
      for (const p of placed) overlap += overlapArea(box, p);
      const score = overlap + DISTANCE_WEIGHT * Math.hypot(offset.x, offset.y);
      if (!best || score < best.score) best = { offset, box, score };
      if (overlap === 0) break;
    }
    placed.push(best!.box);
    result.set(req.id, best!.offset);
  }
  return result;
}
