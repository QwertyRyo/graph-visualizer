import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-slate-200 px-3 py-3 last:border-b-0">
      <h3 className="mb-2 font-mono text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}
