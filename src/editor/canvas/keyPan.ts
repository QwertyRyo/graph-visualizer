import type { Core } from "cytoscape";
import { isTyping } from "../input/keys";
import { useCanvasRegistry } from "./canvasRegistry";

const SPEED = 700;
const DIRECTIONS: Record<string, [number, number]> = {
  w: [0, 1],
  arrowup: [0, 1],
  s: [0, -1],
  arrowdown: [0, -1],
  a: [1, 0],
  arrowleft: [1, 0],
  d: [-1, 0],
  arrowright: [-1, 0],
};

const OWN_ARROWS = ["range", "radio", "color"];

// hold wasd or the arrow keys to pan the view
export function enableKeyPan(cy: Core): () => void {
  const held = new Set<string>();
  let frame = 0;
  let last = 0;

  function tick(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    let dx = 0;
    let dy = 0;
    for (const key of held) {
      dx += DIRECTIONS[key][0];
      dy += DIRECTIONS[key][1];
    }
    const len = Math.hypot(dx, dy);
    if (len > 0) cy.panBy({ x: (dx / len) * SPEED * dt, y: (dy / len) * SPEED * dt });
    frame = held.size > 0 ? requestAnimationFrame(tick) : 0;
  }

  const ignored = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return true;
    if (e.target instanceof HTMLInputElement && OWN_ARROWS.includes(e.target.type)) return true;
    return useCanvasRegistry.getState().active !== cy || !!document.querySelector("dialog[open]");
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!(key in DIRECTIONS) || ignored(e)) return;
    e.preventDefault();
    held.add(key);
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };
  // keyup is not filtered, so a key released over a text field still stops
  const onKeyUp = (e: KeyboardEvent) => {
    held.delete(e.key.toLowerCase());
  };
  const onBlur = () => held.clear();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
  };
}
