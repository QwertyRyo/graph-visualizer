import { useState } from "react";

const STEPS = [0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

function Magnifier({ plus }: { plus: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.6 12.6 17 17" strokeLinecap="round" />
      <path d="M6 8.5h5" strokeLinecap="round" />
      {plus && <path d="M8.5 6v5" strokeLinecap="round" />}
    </svg>
  );
}

const buttonClass =
  "flex h-8 items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-35 disabled:hover:bg-transparent";

type Props = { zoom: number; min: number; max: number; onZoom: (level: number) => void };

export function ZoomControls({ zoom, min, max, onZoom }: Props) {
  const [hint, setHint] = useState(false);
  const below = STEPS.filter((s) => s < zoom * 0.99 && s >= min).at(-1);
  const above = STEPS.find((s) => s > zoom * 1.01 && s <= max);

  return (
    <div data-floating="bottom" className="absolute right-3 bottom-8 z-20">
      <div
        id="zoom-reset-hint"
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 bg-ink px-2 py-1 font-mono text-xs whitespace-nowrap text-white transition duration-150 ease-out ${
          hint ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
        }`}
      >
        Reset to 100%
        <span className="absolute top-full left-1/2 -mt-1 h-2 w-2 -translate-x-1/2 rotate-45 bg-ink" />
      </div>
      <div
        role="group"
        aria-label="Zoom"
        className="flex items-center border border-ink bg-white shadow-[2px_2px_0_0_var(--color-ink)]"
      >
        <button
          type="button"
          title="Zoom out"
          aria-label="Zoom out"
          disabled={below === undefined}
          onClick={() => below !== undefined && onZoom(below)}
          className={`${buttonClass} w-8`}
        >
          <Magnifier plus={false} />
        </button>
        <button
          type="button"
          aria-label={`Zoom ${Math.round(zoom * 100)}%`}
          aria-describedby="zoom-reset-hint"
          onClick={() => onZoom(1)}
          onMouseEnter={() => setHint(true)}
          onMouseLeave={() => setHint(false)}
          onFocus={() => setHint(true)}
          onBlur={() => setHint(false)}
          className={`${buttonClass} min-w-[3.25rem] border-x border-ink px-1 font-mono text-xs font-medium tabular-nums`}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          title="Zoom in"
          aria-label="Zoom in"
          disabled={above === undefined}
          onClick={() => above !== undefined && onZoom(above)}
          className={`${buttonClass} w-8`}
        >
          <Magnifier plus />
        </button>
      </div>
    </div>
  );
}
