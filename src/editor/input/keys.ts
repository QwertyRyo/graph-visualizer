const NON_TEXT_INPUTS = ["checkbox", "radio", "button", "file", "range", "color"];

// true when a keypress belongs to a text field
export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target;
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.includes(el.type);
  return el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}
