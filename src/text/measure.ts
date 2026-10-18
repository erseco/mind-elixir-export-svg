import { ARIAL_BOLD, ARIAL_KERNING_BOLD, ARIAL_KERNING_REGULAR, ARIAL_REGULAR, ARIAL_VERTICAL } from "./metrics.js";

/** The font a piece of text is set in. */
export interface Font {
  size: number;
  /** 100–900. */
  weight: number;
  style: "normal" | "italic";
}

/**
 * Measures text: the advance width of `text` set on one line in `font`, in px. The default
 * measures Arial (Arimo's advances); pass another to lay maps out for another font.
 */
export interface TextMeasurer {
  width(text: string, font: Font): number;
  /** Vertical metrics of the font, in ems. */
  vertical: { ascent: number; descent: number; lineGap: number; xHeight: number };
}

function decode(encoded: string): Map<number, number> {
  const widths = new Map<number, number>();
  for (const run of encoded.split(";")) {
    const [start, digits] = run.split(":") as [string, string];
    const first = parseInt(start, 36);
    for (let i = 0; i < digits.length; i += 3) widths.set(first + i / 3, parseInt(digits.slice(i, i + 3), 36));
  }
  return widths;
}

function decodeKerning(encoded: string): Map<number, number> {
  const pairs = new Map<number, number>();
  for (const pair of encoded.split(";")) {
    const [a, b, k] = pair.split(",").map((v) => parseInt(v, 36)) as [number, number, number];
    pairs.set(a * 0x10000 + b, k);
  }
  return pairs;
}

let regular: Map<number, number> | undefined;
let bold: Map<number, number> | undefined;
let kernRegular: Map<number, number> | undefined;
let kernBold: Map<number, number> | undefined;

// Estimates for text Arial does not have, measured as browsers set it next to Arial (ems)
// Emoji fonts are not proportional (Apple Color Emoji: 1.25em at 16px, 1.1em at 20px; 1.31em in
// Firefox and WebKit at 16px): 1.2em is between them
const EMOJI = 1.2;
const WIDE = 1;
const HANGUL = 0.865;
const ARABIC = 0.32;
const OTHER = 0.556;

const EMOJI_CLUSTER = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const ZERO_WIDTH = /[\p{Mn}\p{Me}\p{Cf}\u200b-\u200f\ufe00-\ufe0f]/u;

function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

// Intl.Segmenter: Node 16+, Chromium 87+, Safari 14.1+, Firefox 125+
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Width of one code point in ems, in `table`. */
function codePointWidth(cp: number, table: Map<number, number>): number {
  const known = table.get(cp);
  if (known !== undefined) return known / 1000;
  const char = String.fromCodePoint(cp);
  if (ZERO_WIDTH.test(char)) return 0;
  if (cp >= 0xac00 && cp <= 0xd7a3) return HANGUL;
  if (isWide(cp)) return WIDE;
  if (cp >= 0x0600 && cp <= 0x08ff) return ARABIC;
  // An accented letter Arial lacks is as wide as its base letter
  const base = char.normalize("NFD");
  if (base !== char) return [...base].reduce((sum, c) => sum + codePointWidth(c.codePointAt(0) as number, table), 0);
  return OTHER;
}

/**
 * Arial, as Pele does it: a table of advances (no canvas, no DOM), so the same map is laid out
 * the same way everywhere, with Arial's kerning pairs (browsers kern by default). Emoji, CJK and scripts Arial lacks use the
 * widths browsers give their fallback fonts, which vary slightly by browser and system.
 */
export const arialMeasurer: TextMeasurer = {
  vertical: ARIAL_VERTICAL,
  width(text, font) {
    const heavy = font.weight >= 600;
    const table = heavy ? (bold ??= decode(ARIAL_BOLD)) : (regular ??= decode(ARIAL_REGULAR));
    const kerning = heavy
      ? (kernBold ??= decodeKerning(ARIAL_KERNING_BOLD))
      : (kernRegular ??= decodeKerning(ARIAL_KERNING_REGULAR));
    let units = 0;
    let previous = -1;
    for (const { segment } of graphemes.segment(text)) {
      if (EMOJI_CLUSTER.test(segment)) {
        units += EMOJI * 1000;
        previous = -1;
        continue;
      }
      for (const c of segment) {
        const cp = c.codePointAt(0) as number;
        units += codePointWidth(cp, table) * 1000 + (previous >= 0 ? (kerning.get(previous * 0x10000 + cp) ?? 0) : 0);
        previous = cp;
      }
    }
    return (units / 1000) * font.size;
  },
};
