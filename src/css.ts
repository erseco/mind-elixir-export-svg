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

// The 148 CSS named colours, "name:rrggbb"
const NAMES =
  "aliceblue:f0f8ff;antiquewhite:faebd7;aqua:00ffff;aquamarine:7fffd4;azure:f0ffff;beige:f5f5dc;bisque:ffe4c4;black:000000;blanchedalmond:ffebcd;blue:0000ff;blueviolet:8a2be2;brown:a52a2a;burlywood:deb887;cadetblue:5f9ea0;chartreuse:7fff00;chocolate:d2691e;coral:ff7f50;cornflowerblue:6495ed;cornsilk:fff8dc;crimson:dc143c;cyan:00ffff;darkblue:00008b;darkcyan:008b8b;darkgoldenrod:b8860b;darkgray:a9a9a9;darkgreen:006400;darkgrey:a9a9a9;darkkhaki:bdb76b;darkmagenta:8b008b;darkolivegreen:556b2f;darkorange:ff8c00;darkorchid:9932cc;darkred:8b0000;darksalmon:e9967a;darkseagreen:8fbc8f;darkslateblue:483d8b;darkslategray:2f4f4f;darkslategrey:2f4f4f;darkturquoise:00ced1;darkviolet:9400d3;deeppink:ff1493;deepskyblue:00bfff;dimgray:696969;dimgrey:696969;dodgerblue:1e90ff;firebrick:b22222;floralwhite:fffaf0;forestgreen:228b22;fuchsia:ff00ff;gainsboro:dcdcdc;ghostwhite:f8f8ff;gold:ffd700;goldenrod:daa520;gray:808080;green:008000;greenyellow:adff2f;grey:808080;honeydew:f0fff0;hotpink:ff69b4;indianred:cd5c5c;indigo:4b0082;ivory:fffff0;khaki:f0e68c;lavender:e6e6fa;lavenderblush:fff0f5;lawngreen:7cfc00;lemonchiffon:fffacd;lightblue:add8e6;lightcoral:f08080;lightcyan:e0ffff;lightgoldenrodyellow:fafad2;lightgray:d3d3d3;lightgreen:90ee90;lightgrey:d3d3d3;lightpink:ffb6c1;lightsalmon:ffa07a;lightseagreen:20b2aa;lightskyblue:87cefa;lightslategray:778899;lightslategrey:778899;lightsteelblue:b0c4de;lightyellow:ffffe0;lime:00ff00;limegreen:32cd32;linen:faf0e6;magenta:ff00ff;maroon:800000;mediumaquamarine:66cdaa;mediumblue:0000cd;mediumorchid:ba55d3;mediumpurple:9370db;mediumseagreen:3cb371;mediumslateblue:7b68ee;mediumspringgreen:00fa9a;mediumturquoise:48d1cc;mediumvioletred:c71585;midnightblue:191970;mintcream:f5fffa;mistyrose:ffe4e1;moccasin:ffe4b5;navajowhite:ffdead;navy:000080;oldlace:fdf5e6;olive:808000;olivedrab:6b8e23;orange:ffa500;orangered:ff4500;orchid:da70d6;palegoldenrod:eee8aa;palegreen:98fb98;paleturquoise:afeeee;palevioletred:db7093;papayawhip:ffefd5;peachpuff:ffdab9;peru:cd853f;pink:ffc0cb;plum:dda0dd;powderblue:b0e0e6;purple:800080;rebeccapurple:663399;red:ff0000;rosybrown:bc8f8f;royalblue:4169e1;saddlebrown:8b4513;salmon:fa8072;sandybrown:f4a460;seagreen:2e8b57;seashell:fff5ee;sienna:a0522d;silver:c0c0c0;skyblue:87ceeb;slateblue:6a5acd;slategray:708090;slategrey:708090;snow:fffafa;springgreen:00ff7f;steelblue:4682b4;tan:d2b48c;teal:008080;thistle:d8bfd8;tomato:ff6347;turquoise:40e0d0;violet:ee82ee;wheat:f5deb3;white:ffffff;whitesmoke:f5f5f5;yellow:ffff00;yellowgreen:9acd32";
let named: Map<string, string> | undefined;

/**
 * Parses a CSS colour: `rgb()`/`rgba()` (comma or space syntax), `#hex`, a named colour or
 * `transparent`. Returns `null` for colours it does not understand (`color()`, `oklch()`,
 * `currentColor`…), and an alpha of 0 for transparent ones.
 */
export function parseColor(value: string): Color | null {
  const v = value.trim().toLowerCase();
  if (v === "transparent") return { hex: "#000000", alpha: 0 };
  named ??= new Map(NAMES.split(";").map((pair) => pair.split(":") as [string, string]));
  const name = named.get(v);
  if (name) return { hex: `#${name}`, alpha: 1 };
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
