import { useRef, useState } from "react";
import { setWeight } from "../../domain/graph/ops";
import { MAX_LABEL_LENGTH } from "../../domain/graph/schema";
import { tryRelabel } from "../relabel";
import { useEditorStore } from "../store";

export type EditTarget = {
  kind: "node" | "edge";
  id: string;
  x: number;
  y: number;
  value: string;
  width?: number;
};

const MIN_WIDTH = 80;

type Props = { target: EditTarget; onDone: () => void };

export function InlineEditor({ target, onDone }: Props) {
  const [value, setValue] = useState(target.value);
  const finished = useRef(false);

  function save() {
    if (finished.current) return;
    finished.current = true;
    const { commit } = useEditorStore.getState();
    const text = value.trim();
    if (text !== "" && text !== target.value) {
      if (target.kind === "node") {
        tryRelabel(target.id, text);
      } else if (Number.isFinite(Number(text))) {
        commit((d) => setWeight(d, target.id, Number(text)));
      }
    }
    onDone();
  }

  function cancel() {
    finished.current = true;
    onDone();
  }

  return (
    <input
      autoFocus
      value={value}
      maxLength={target.kind === "node" ? MAX_LABEL_LENGTH : undefined}
      inputMode={target.kind === "edge" ? "decimal" : "text"}
      aria-label={target.kind === "node" ? "Node label" : "Edge weight"}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          save();
        }
        if (e.key === "Escape") cancel();
      }}
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 border border-accent bg-white px-1 py-0.5 text-center text-sm shadow"
      style={{ left: target.x, top: target.y, width: Math.max(MIN_WIDTH, target.width ?? 0) }}
    />
  );
}
