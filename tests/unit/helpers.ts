import { DOMParser, type Document, type Element } from "@xmldom/xmldom";

/** Parses SVG as strict XML; throws on any well-formedness error. */
export function parseSvg(svg: string): Document {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level, message) => {
      errors.push(`${level}: ${message}`);
    },
  }).parseFromString(svg, "image/svg+xml");
  if (errors.length) throw new Error(errors.join("\n"));
  return doc;
}

/** Every element of a document, depth first. */
export function elements(doc: Document): Element[] {
  const out: Element[] = [];
  const walk = (el: Element) => {
    out.push(el);
    for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) walk(c as Element);
  };
  if (doc.documentElement) walk(doc.documentElement);
  return out;
}
