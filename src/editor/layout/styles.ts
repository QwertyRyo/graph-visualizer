export const buttonClass = (active = false) =>
  `rounded-none px-2 py-1 text-center text-sm disabled:opacity-40 ${
    active ? "bg-accent text-white" : "bg-slate-100 hover:bg-slate-200"
  }`;

export const dangerButton =
  "w-full rounded-none bg-slate-100 px-2 py-1 text-left text-sm text-danger-strong hover:bg-danger hover:text-white disabled:opacity-40 disabled:hover:bg-slate-100 disabled:hover:text-danger-strong";

export const floatingCard = "border border-ink bg-white shadow-[4px_4px_0_0_var(--color-ink)]";

export const floatingButton =
  "flex h-9 items-center gap-1 border border-ink bg-white px-3 text-sm shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-accent-soft active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 disabled:hover:bg-white disabled:active:translate-0 disabled:active:shadow-[2px_2px_0_0_var(--color-ink)]";

export const primaryButton =
  "border border-ink bg-accent px-4 py-1.5 text-sm font-medium text-white shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-accent-strong active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40 disabled:hover:bg-accent disabled:active:translate-0 disabled:active:shadow-[2px_2px_0_0_var(--color-ink)]";
export const dangerPrimaryButton =
  "border border-ink bg-danger px-4 py-1.5 text-sm font-medium text-white shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-danger-strong active:translate-x-0.5 active:translate-y-0.5 active:shadow-none";
export const inputClass = "w-full rounded-none border border-slate-300 px-2 py-1 text-sm";
