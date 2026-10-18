/**
 * XML serialization primitives. Every string written into the SVG goes through `escapeXml`,
 * and every number through `num`, so user text can never change the document's structure and
 * no attribute can be `NaN`, `Infinity` or a CSS keyword such as `auto`.
 */

// Characters XML 1.0 does not allow at all: C0 controls other than tab, LF and CR, and the
// non-characters U+FFFE/U+FFFF.
const ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
// A lone surrogate is not a character either.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes text for XML text content and attribute values. Characters XML cannot hold are
 * removed, and lone surrogates become U+FFFD. A replacement function is used throughout, so
 * `$` patterns in the text have no special meaning.
 */
export function escapeXml(text: string): string {
  return String(text)
    .replace(LONE_SURROGATE, () => "�")
    .replace(ILLEGAL, () => "")
    .replace(/[&<>"']/g, (c) => ESCAPES[c] as string);
}

/**
 * A coordinate or length with at most two decimals. Throws on a non-finite value, so invalid
 * geometry fails loudly instead of producing an SVG that does not render.
 */
export function num(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`Not a finite number: ${value}`);
  const rounded = Math.round(value * 100) / 100;
  // -0 and tiny negatives that round to 0 are written as 0
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export type Attributes = Record<string, string | number | undefined | null | false>;

/** Serializes attributes in the given order, skipping `undefined`, `null` and `false`. */
export function attributes(attrs: Attributes): string {
  let out = "";
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (!/^[a-zA-Z][\w:-]*$/.test(name)) throw new RangeError(`Invalid attribute name: ${name}`);
    out += ` ${name}="${typeof value === "number" ? num(value) : escapeXml(value)}"`;
  }
  return out;
}

/** An element with escaped attributes and already-serialized children (or none). */
export function element(name: string, attrs: Attributes, children?: string): string {
  const open = `<${name}${attributes(attrs)}`;
  return children === undefined || children === "" ? `${open}/>` : `${open}>${children}</${name}>`;
}
