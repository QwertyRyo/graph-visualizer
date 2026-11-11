import { useAutoAnimate } from "@formkit/auto-animate/react";
import type { AutoAnimationPlugin } from "@formkit/auto-animate";
import { useEffect, useMemo, type ReactNode } from "react";
import { ALGORITHMS, edgeWeight, isMst, stateAt, type Step, type Traversal } from "../../domain/graph/traversal";
import { RUN_CLOSED } from "../canvas/cyStyle";
import { useEditorStore } from "../store";
import { floatingCard } from "./styles";
import { WindowBar } from "./WindowBar";

const STEP_MS = 800;
const STACK_MS = 280;
const SLIDE_PX = 28;

// what the step just taken did, in words
function describe(step: Step | null, t: Traversal, label: (id: string | null) => string): string {
  if (!step && t.algorithm === "kruskal") return "Edges are sorted by weight, cheapest first. Press play or step forward.";
  if (!step) return `Ready to start at ${label(t.start)}. Press play or step forward.`;
  const bfs = t.algorithm === "bfs";
  const prim = t.algorithm === "prim";
  const dijkstra = t.algorithm === "dijkstra";
  const dist = (d: number) => (d === Infinity ? "∞" : String(d));
  switch (step.kind) {
    case "discover": {
      if (prim) return `Start the tree at ${label(step.node)}: \n its edges become candidates`;
      if (dijkstra) return `Start at ${label(step.node)}: \n distance 0, every other vertex ∞`;
      const queued = bfs ? ", added to the queue" : "";
      if (step.parent) return `Discover ${label(step.node)} from ${label(step.parent)}`;
      const where = step.time === 1 ? "Start at" : "No reachable neighbors, start again at";
      return `${where} ${label(step.node)}: \n d = ${step.time}${queued}`;
    }
    case "back-edge": {
      const lowered = step.low[0];
      const low = lowered ? `low(${label(step.node)}) = ${lowered.value}` : `low(${label(step.node)}) stays`;
      return `Back edge ${label(step.node)} → ${label(step.ancestor)}: ${low}`;
    }
    case "finish": {
      const back = step.parent ? `\n Return back to ${label(step.parent)}` : "";
      const lowered = step.low[0];
      const low = lowered ? `, low(${label(lowered.node)}) = ${lowered.value}` : "";
      return `Finish ${label(step.node)}: \n f = ${step.time}${back}${low}`;
    }
    case "visit":
      if (dijkstra) return `Take ${label(step.node)}, the closest vertex left: \n its distance is final`;
      return `Take ${label(step.node)} off the queue and scan its neighbors`;
    case "relax": {
      const edge = `${label(step.node)}→${label(step.other)} (weight ${step.weight})`;
      return step.improved
        ? `Relax ${edge}: \n ${dist(step.before)} → ${step.after}, a shorter path through ${label(step.node)}`
        : `Relax ${edge}: \n ${step.after} is no shorter than ${dist(step.before)}, keep it`;
    }
    case "mst-edge": {
      const edge = `${label(step.node)}–${label(step.other)} (weight ${step.weight})`;
      if (prim) {
        return step.accepted
          ? `Take ${edge}: \n the cheapest edge leaving the tree, so add ${label(step.other)}`
          : `Skip ${edge}: \n ${label(step.other)} joined the tree already, it would make a cycle`;
      }
      return step.accepted
        ? `Take ${edge}: \n It joins two separate trees, so add it`
        : `Skip ${edge}: \n ${label(step.node)} and ${label(step.other)} are already connected, it would make a cycle`;
    }
  }
}

const stackMotion: AutoAnimationPlugin = (el, action, from?: { top: number; left: number }, to?: { top: number; left: number }) => {
  // a plugin opts out of the library's own reduced motion check, so honour it here
  const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : STACK_MS;
  let keyframes: Keyframe[];
  if (action === "remove") {
    keyframes = [
      { transform: "translateX(0)", opacity: 1 },
      { transform: `translateX(-${SLIDE_PX}px)`, opacity: 0 },
    ];
  } else if (action === "add") {
    keyframes = [
      { transform: `translateX(-${SLIDE_PX}px)`, opacity: 0 },
      { transform: "translateX(0)", opacity: 1 },
    ];
  } else {
    const dx = from && to ? from.left - to.left : 0;
    const dy = from && to ? from.top - to.top : 0;
    keyframes = [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }];
  }
  return new KeyframeEffect(el, keyframes, { duration, easing: "ease-out" });
};

function Icon({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const controlClass =
  "flex h-8 w-9 items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-transparent";

function Control(props: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={props.label} aria-label={props.label} disabled={props.disabled} onClick={props.onClick} className={controlClass}>
      {props.children}
    </button>
  );
}

// the play button and step count, then the step controls with the stack or queue beside them,
// floating along the bottom while an algorithm runs
export function AlgorithmBar() {
  const run = useEditorStore((s) => s.run);
  const doc = useEditorStore((s) => s.doc);
  const playing = run?.playing ?? false;
  const traversal = run?.traversal;
  const position = run?.position ?? 0;
  const state = useMemo(() => (traversal ? stateAt(traversal, position) : null), [traversal, position]);
  const [stackList] = useAutoAnimate<HTMLOListElement>(stackMotion);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const { run, setRunPosition } = useEditorStore.getState();
      if (run) setRunPosition(run.position + 1);
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [playing]);

  if (!run || !traversal || !state) return null;

  const { setRunPosition, setPlaying, endRun } = useEditorStore.getState();
  const total = traversal.steps.length;
  const atEnd = position >= total;
  const bfs = traversal.algorithm === "bfs";
  const mst = isMst(traversal.algorithm);
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(doc.edges.map((e) => [e.id, e]));
  const label = (id: string | null) => (id ? (byId.get(id)?.label ?? "?") : "?");
  const name = ALGORITHMS.find((a) => a.id === traversal.algorithm)?.label;
  const dijkstra = traversal.algorithm === "dijkstra";
  const column = mst || dijkstra ? state.frontier : [...state.frontier].reverse();
  const nextUp = bfs || mst || dijkstra ? state.frontier[0] : state.frontier[state.frontier.length - 1];
  const panel = dijkstra
    ? { title: "Priority queue", aria: "Vertices waiting, closest first", next: "min" }
    : traversal.algorithm === "kruskal"
    ? { title: "Edges left", aria: "Edges still to check, next first", next: "next" }
    : traversal.algorithm === "prim"
    ? { title: "Candidates", aria: "Edges leaving the tree, cheapest first", next: "next" }
    : bfs
      ? { title: "Queue", aria: "Queue, back to front", next: "front" }
      : { title: "Stack", aria: "Stack, top to bottom", next: "top" };
  // a vertex chip shows its color, an edge chip its ends and weight
  const chip = (id: string) => {
    const e = mst ? edgeById.get(id) : undefined;
    if (e) return { color: null, text: `${label(e.source)}–${label(e.target)}`, weight: edgeWeight(doc, e.weight) };
    return { color: byId.get(id)?.color, text: label(id), weight: dijkstra ? (state.distance.get(id) ?? null) : null };
  };
  // stepping by hand pauses playback
  const go = (to: number) => {
    setPlaying(false);
    setRunPosition(to);
  };
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (atEnd) setRunPosition(0);
    setPlaying(true);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-wrap items-end justify-center gap-3 px-3">
      <div className={`pointer-events-auto flex items-center gap-2.5 p-1.5 pr-4 ${floatingCard}`}>
        <button
          type="button"
          title={playing ? "Pause" : atEnd ? "Play from the start" : "Play"}
          aria-label={playing ? "Pause" : atEnd ? "Play from the start" : "Play"}
          onClick={togglePlay}
          className="flex h-11 w-11 items-center justify-center bg-accent text-white hover:bg-accent-strong"
        >
          {playing ? (
            <Icon size={18}>
              <path d="M8 5v14M16 5v14" fill="none" strokeWidth="3" strokeLinecap="round" />
            </Icon>
          ) : (
            <Icon size={18}>
              <path d="M8 5v14l11-7z" />
            </Icon>
          )}
        </button>
        <span className="font-mono text-sm text-slate-500 tabular-nums">
          <span className="font-semibold text-slate-900">{position}</span> / {total}
        </span>
      </div>

      <section aria-label={`${name} playback`} className={`pointer-events-auto w-[30rem] max-w-full ${floatingCard}`}>
        <WindowBar title={name ?? "Algorithm"}>
          <button
            type="button"
            title="Stop and go back to editing"
            onClick={endRun}
            className="bg-danger px-2.5 py-0.5 font-bold tracking-widest text-white uppercase hover:bg-danger-strong"
          >
            Done
          </button>
        </WindowBar>

        <div className="flex h-44 gap-3 p-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-1">
              <Control label="Step back" disabled={position === 0} onClick={() => go(position - 1)}>
                <Icon>
                  <path d="M6 5v14" fill="none" />
                  <path d="M18 5 9 12l9 7z" />
                </Icon>
              </Control>
              <Control label="Step forward" disabled={atEnd} onClick={() => go(position + 1)}>
                <Icon>
                  <path d="M6 5l9 7-9 7z" />
                  <path d="M18 5v14" fill="none" />
                </Icon>
              </Control>
              <Control label="Skip to end" disabled={atEnd} onClick={() => go(total)}>
                <Icon>
                  <path d="M3 6l7 6-7 6zM11 6l7 6-7 6z" />
                  <path d="M21 5v14" fill="none" />
                </Icon>
              </Control>
            </div>
            <p aria-live="polite" className="mt-2 text-sm whitespace-pre-line">
              {describe(state.step, traversal, label)}
            </p>
            {traversal.algorithm === "dfs" && (
              <span className="mt-auto flex items-center gap-1 text-xs text-slate-500">
                <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: RUN_CLOSED }} /> back edge
              </span>
            )}
            {dijkstra && (
              <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 border-t-4" style={{ borderColor: "#94a3b8" }} /> shortest paths so far
                </span>
                <span>dark outline: distance final</span>
              </span>
            )}
            {mst && (
              <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 border-t-4" style={{ borderColor: "#94a3b8" }} /> in the tree
                </span>
                <span>faded: skipped</span>
                <span>
                  total weight {[...state.treeEdges].reduce((sum, id) => sum + edgeWeight(doc, edgeById.get(id)?.weight ?? 0), 0)}
                </span>
              </span>
            )}
          </div>

          <div className="flex w-32 shrink-0 flex-col border-l border-slate-200">
            <h3 className="pl-3 font-mono text-xs font-semibold tracking-wide text-slate-500 uppercase">{panel.title}</h3>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1 pr-1" style={{ paddingLeft: SLIDE_PX }}>
              <ol
                ref={stackList}
                aria-label={panel.aria}
                className="flex shrink-0 grow flex-col justify-end gap-1"
              >
                {column.length === 0 && <li className="py-0.5 text-center text-xs text-slate-400">empty</li>}
                {column.map((id) => {
                  const c = chip(id);
                  return (
                    <li
                      key={id}
                      className={`flex h-6 shrink-0 items-center gap-1.5 border px-1.5 font-mono text-xs ${
                        id === nextUp ? "border-accent bg-accent-soft" : "border-slate-200 bg-white"
                      }`}
                    >
                      {c.color !== null && (
                        <span className="h-2 w-2 shrink-0 rounded-full border border-slate-400" style={{ background: c.color }} />
                      )}
                      <span className="truncate">{c.text}</span>
                      {c.weight !== null && <span className="text-slate-400">{c.weight}</span>}
                      {id === nextUp && <span className="ml-auto font-sans text-[10px] text-accent-strong">{panel.next}</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
