import { useEffect, useRef } from "react";
import { useAlertStore } from "./alertStore";

// native dialog gives focus trapping and escape, styled as our own
export function AlertDialog() {
  const alert = useAlertStore((s) => s.alert);
  const closeAlert = useAlertStore((s) => s.closeAlert);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current!;
    if (alert && !dialog.open) dialog.showModal();
    if (!alert && dialog.open) dialog.close();
  }, [alert]);

  return (
    <dialog
      ref={ref}
      onClose={closeAlert}
      onClick={(e) => {
        // clicking the dimmed backdrop closes it
        if (e.target === e.currentTarget) closeAlert();
      }}
      aria-labelledby="alert-title"
      className="m-auto w-80 max-w-[calc(100vw-2rem)] border border-ink bg-white p-0 shadow-[6px_6px_0_0_var(--color-ink)] backdrop:bg-slate-900/40"
    >
      <div className="bg-ink px-3 py-1.5 font-mono text-xs font-bold tracking-widest text-accent-bright uppercase">
        {"// "}Notice
      </div>
      <div className="p-5">
        <h2 id="alert-title" className="text-base font-semibold text-slate-900">
          {alert?.title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{alert?.message}</p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={closeAlert}
            className="border border-ink bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-accent-strong active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            OK
          </button>
        </div>
      </div>
    </dialog>
  );
}
