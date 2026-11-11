export type XmlElement = {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
};

export class XmlError extends Error {}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ref] ?? whole;
  });
}

const localName = (qname: string) => qname.slice(qname.indexOf(":") + 1);

// throws XmlError on malformed input
export function parseXml(src: string): XmlElement {
  const root: XmlElement = { name: "#document", attrs: {}, children: [], text: "" };
  const stack = [root];
  let i = 0;

  const skipPast = (end: string) => {
    const at = src.indexOf(end, i);
    if (at < 0) throw new XmlError(`Missing ${end}`);
    const from = i;
    i = at + end.length;
    return src.slice(from, at);
  };

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    const textEnd = lt < 0 ? src.length : lt;
    if (textEnd > i) stack.at(-1)!.text += decode(src.slice(i, textEnd));
    if (lt < 0) break;
    i = lt;

    if (src.startsWith("<!--", i)) {
      skipPast("-->");
    } else if (src.startsWith("<![CDATA[", i)) {
      i += 9;
      stack.at(-1)!.text += skipPast("]]>");
    } else if (src.startsWith("<?", i)) {
      skipPast("?>");
    } else if (src.startsWith("<!", i)) {
      const close = src.indexOf(">", i);
      const bracket = src.indexOf("[", i);
      i = bracket >= 0 && bracket < close ? src.indexOf(">", src.indexOf("]", bracket)) + 1 : close + 1;
      if (i <= 0) throw new XmlError("Unclosed doctype");
    } else if (src.startsWith("</", i)) {
      i += 2;
      const name = localName(skipPast(">").trim());
      const open = stack.pop()!;
      if (stack.length === 0 || open.name !== name) throw new XmlError(`Unexpected </${name}>`);
    } else {
      const m = /^<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(src.slice(i));
      if (!m) throw new XmlError(`Malformed tag at ${i}`);
      i += m[0].length;
      const el: XmlElement = { name: localName(m[1]), attrs: {}, children: [], text: "" };
      for (const a of m[2].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        el.attrs[a[1]] = decode(a[2] ?? a[3]);
      }
      stack.at(-1)!.children.push(el);
      if (!m[3]) stack.push(el);
    }
  }

  if (stack.length !== 1) throw new XmlError(`Unclosed <${stack.at(-1)!.name}>`);
  const top = root.children;
  if (top.length !== 1) throw new XmlError("Expected one root element");
  return top[0];
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// every descendant with this name, depth first
export function findAll(el: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const c of el.children) {
    if (c.name === name) out.push(c);
    out.push(...findAll(c, name));
  }
  return out;
}
