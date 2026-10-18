/**
 * Converts computed CSS values into SVG presentation values. Only values that were understood
 * are returned, so nothing from a stylesheet reaches the SVG unchecked.
 */

export interface Color {
  /** `#rrggbb`. */
  hex: string;
  /** 0 to 1. */
  alpha: number;
}

const hex2 = (n: number) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, "0");

function channel(value: string): number {
  return value.endsWith("%") ? (parseFloat(value) * 255) / 100 : parseFloat(value);
}

function alphaValue(value: string | undefined): number {
  if (value === undefined) return 1;
  const a = value.endsWith("%") ? parseFloat(value) / 100 : parseFloat(value);
  return Math.min(1, Math.max(0, a));
}

/**
 * Parses a computed colour: `rgb()`/`rgba()` (comma or space syntax), `#hex` or `transparent`.
 * Returns `null` for colours it does not understand (`color()`, `oklch()`…), and an alpha of 0
 * for transparent ones.
 */
export function parseColor(value: string): Color | null {
  const v = value.trim().toLowerCase();
  if (v === "transparent") return { hex: "#000000", alpha: 0 };
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    let digits = hex[1] as string;
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join("");
    const alpha = digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1;
    return { hex: `#${digits.slice(0, 6)}`, alpha };
  }
  const rgb = /^rgba?\(\s*([^)]*)\)$/.exec(v);
  if (!rgb) return null;
  const parts = (rgb[1] as string).split(/\s*[,/]\s*|\s+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4 || parts.some((p) => !/^-?[\d.]+%?$/.test(p))) return null;
  const [r, g, b, a] = parts as [string, string, string, string | undefined];
  return { hex: `#${hex2(channel(r))}${hex2(channel(g))}${hex2(channel(b))}`, alpha: alphaValue(a) };
}

/** A CSS pixel length (`"12px"`, `"0"`); `NaN` for anything else. */
export function parsePx(value: string): number {
  const v = value.trim();
  if (v === "0") return 0;
  const m = /^(-?[\d.]+(?:e-?\d+)?)px$/.exec(v);
  return m ? parseFloat(m[1] as string) : Number.NaN;
}

export interface Radius {
  x: number;
  y: number;
}

/** One computed corner radius (`"8px"`, `"8px 4px"`, `"50%"`) for a box of `width` × `height`. */
export function parseCornerRadius(value: string, width: number, height: number): Radius {
  const parts = value.trim().split(/\s+/);
  const resolve = (part: string, size: number) => {
    if (part.endsWith("%")) return (parseFloat(part) * size) / 100;
    const px = parsePx(part);
    return Number.isFinite(px) ? Math.max(0, px) : 0;
  };
  const x = resolve(parts[0] as string, width);
  const y =
    parts[1] === undefined ? (parts[0]?.endsWith("%") ? resolve(parts[0], height) : x) : resolve(parts[1], height);
  return { x, y };
}

/** Corner radii top-left, top-right, bottom-right, bottom-left. */
export type Radii = [Radius, Radius, Radius, Radius];

/** Scales radii down as CSS does when adjacent radii do not fit the box. */
export function clampRadii(radii: Radii, width: number, height: number): Radii {
  const [tl, tr, br, bl] = radii;
  const ratios = [width / (tl.x + tr.x), width / (bl.x + br.x), height / (tl.y + bl.y), height / (tr.y + br.y)].filter(
    (r) => Number.isFinite(r),
  );
  const f = Math.min(1, ...ratios);
  return f < 1 ? (radii.map((r) => ({ x: r.x * f, y: r.y * f })) as Radii) : radii;
}

/** The decoration lines of a computed `text-decoration-line`, in a stable order. */
export function decorationLines(value: string): string[] {
  const words = value.trim().split(/\s+/);
  return ["underline", "overline", "line-through"].filter((w) => words.includes(w));
}

/** A computed `font-weight` as an SVG value (`"400"`, `"700"`…). */
export function fontWeight(value: string): string {
  if (value === "normal") return "400";
  if (value === "bold") return "700";
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? String(n) : "400";
}

/** A computed `font-family`, with each family name re-quoted safely. */
export function fontFamily(value: string): string {
  const families: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const c of value) {
    if (quote) {
      if (c === quote) quote = null;
      else current += c;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ",") {
      families.push(current.trim());
      current = "";
    } else current += c;
  }
  families.push(current.trim());
  const generic =
    /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|emoji|math|fangsong)$/;
  return (
    families
      .filter(Boolean)
      // Identifiers (including vendor keywords such as -apple-system) stay bare; other names are quoted
      .map((f) => (generic.test(f) || /^-?[A-Za-z][\w-]*$/.test(f) ? f : `'${f.replace(/['\\]/g, "")}'`))
      .join(", ") || "sans-serif"
  );
}
