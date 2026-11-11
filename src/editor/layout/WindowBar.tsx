import type { ReactNode } from "react";

// the dark title strip across the top of a floating window, actions on the right
export function WindowBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 bg-ink px-3 py-1.5 font-mono text-xs">
      <h2 className="truncate font-bold tracking-widest text-accent-bright uppercase">{"// "}{title}</h2>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </div>
  );
}

export function WindowClose({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="px-1 text-slate-400 hover:text-white">
      ✕
    </button>
  );
}
