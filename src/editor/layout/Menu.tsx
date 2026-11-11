import { useEffect, useRef, useState } from "react";

type Item<T extends string> = { id: T; label: string; icon?: string; disabled?: boolean; title?: string };

type Props<T extends string> = {
  label: string;
  items: readonly Item<T>[];
  selected?: T | null | readonly T[];
  align?: "left" | "right";
  disabled?: boolean;
  title?: string;
  buttonClassName?: string;
  onSelect: (id: T) => void;
};

// a button that opens a list of choices below it
export function Menu<T extends string>({ label, items, selected, align = "right", disabled = false, title, buttonClassName, onSelect }: Props<T>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const checkable = selected !== undefined;
  const toggles = Array.isArray(selected);
  const isChecked = (id: T) => (toggles ? (selected as readonly T[]).includes(id) : selected === id);
  const shown = open && !disabled;

  useEffect(() => {
    if (!shown) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [shown]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={shown}
        disabled={disabled}
        title={title}
        onClick={() => setOpen(!shown)}
        className={buttonClassName ?? `rounded px-2 py-1 text-sm hover:bg-slate-100 ${shown ? "bg-slate-100" : ""}`}
      >
        {label} ▾
      </button>
      {shown && (
        <ul role="menu" className={`absolute ${align === "left" ? "left-0" : "right-0"} z-20 mt-1.5 max-h-80 min-w-44 overflow-y-auto border border-ink bg-white py-1 shadow-[4px_4px_0_0_var(--color-ink)]`}>
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role={toggles ? "menuitemcheckbox" : checkable ? "menuitemradio" : "menuitem"}
                aria-checked={checkable ? isChecked(item.id) : undefined}
                disabled={item.disabled}
                title={item.title}
                onClick={() => {
                  onSelect(item.id);
                  if (!toggles) setOpen(false);
                }}
                className={`flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-sm disabled:text-slate-400 disabled:hover:bg-transparent ${
                  checkable && isChecked(item.id) ? "bg-accent-soft text-accent-strong hover:bg-accent-tint" : "hover:bg-slate-100"
                }`}
              >
                {checkable && <span className="w-3 text-accent">{isChecked(item.id) ? "✓" : ""}</span>}
                {item.icon && <img src={item.icon} alt="" className="h-6 w-6 object-contain" />}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
