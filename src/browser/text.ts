import { decorationLines, fontFamily, fontWeight, parseColor, parsePx } from "../css.js";
import type { Frame } from "./frame.js";
import type { RunStyle, Segment } from "../text/lines.js";

/**
 * Measures text as the browser laid it out: every word (or, where a word is split across
 * lines, every grapheme) gets the box it was drawn in, from `Range.getClientRects()`. Line
 * breaks therefore come from the browser itself, never from re-implementing its wrapping.
 */

const ATOMIC = /^(inline-block|inline-flex|inline-grid|inline-table)$/;

function decorations(start: Element, stop: Element): string[] {
  const lines = new Set<string>();
  // Decorations propagate to inline descendants, but not into atomic inline boxes
  for (let el: Element | null = start; el && el !== stop; el = el.parentElement) {
    const style = getComputedStyle(el);
    for (const line of decorationLines(style.textDecorationLine)) lines.add(line);
    if (ATOMIC.test(style.display) || style.position === "absolute" || style.position === "fixed") break;
  }
  return [...lines];
}

/** Creates and caches run styles, and the canvas used for font metrics. */
export class StyleCache {
  private readonly styles = new Map<Element, RunStyle>();
  private readonly metrics = new Map<string, { ascent: number; descent: number }>();
  private context: CanvasRenderingContext2D | null | undefined;
  /** Font shorthands used, for the font availability check. */
  readonly fonts = new Set<string>();
  /** Font family names used, as computed (unquoted is not guaranteed). */
  readonly families = new Set<string>();

  constructor(private readonly stop: Element) {}

  private fontMetrics(font: string, size: number): { ascent: number; descent: number } {
    let m = this.metrics.get(font);
    if (!m) {
      if (this.context === undefined) this.context = document.createElement("canvas").getContext("2d");
      const ctx = this.context;
      let ascent = Number.NaN;
      let descent = Number.NaN;
      if (ctx) {
        ctx.font = font;
        const tm = ctx.measureText("Hg");
        ascent = tm.fontBoundingBoxAscent;
        descent = tm.fontBoundingBoxDescent;
      }
      // Without font metrics, the usual proportions of Latin fonts
      m = {
        ascent: Number.isFinite(ascent) ? ascent : size * 0.8,
        descent: Number.isFinite(descent) ? descent : size * 0.2,
      };
      this.metrics.set(font, m);
    }
    return m;
  }

  /** The style of text inside `parent`, or `null` when it is not drawn in a known colour. */
  get(parent: Element): RunStyle | null {
    const cached = this.styles.get(parent);
    if (cached) return cached;
    const cs = getComputedStyle(parent);
    const fill = parseColor(cs.color);
    const size = parsePx(cs.fontSize);
    if (!fill || !(size > 0)) return null;
    const family = fontFamily(cs.fontFamily);
    const weight = fontWeight(cs.fontWeight);
    const fontStyle = cs.fontStyle === "italic" ? "italic" : cs.fontStyle.startsWith("oblique") ? "oblique" : "normal";
    const font = `${fontStyle} ${weight} ${size}px ${cs.fontFamily}`;
    this.fonts.add(font);
    for (const f of cs.fontFamily.split(",")) this.families.add(f);
    const letterSpacing = parsePx(cs.letterSpacing);
    const style: RunStyle = {
      fontFamily: family,
      fontSize: size,
      fontWeight: weight,
      fontStyle,
      fill,
      decoration: decorations(parent, this.stop),
      letterSpacing: Number.isFinite(letterSpacing) ? letterSpacing : 0,
      ...this.fontMetrics(font, size),
    };
    this.styles.set(parent, style);
    return style;
  }
}

type SegmenterLike = { segment(text: string): Iterable<{ segment: string; index: number }> };

function segmenter(granularity: "word" | "grapheme"): SegmenterLike {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) return new Intl.Segmenter(undefined, { granularity });
  // Without Intl.Segmenter: words split at spaces, graphemes by code point
  return {
    *segment(text: string) {
      const re = granularity === "word" ? /\s+|[^\s]+/gu : /./gsu;
      for (const m of text.matchAll(re)) yield { segment: m[0], index: m.index };
    },
  };
}

const words = segmenter("word");
const graphemes = segmenter("grapheme");

/** The box of a range: its only rect, or (for a single grapheme) the union of its rects. */
function box(range: Range, frame: Frame, union: boolean): Segment["box"] | null {
  const rects = range.getClientRects();
  if (rects.length === 0 || (rects.length > 1 && !union)) return null;
  const r = rects.length === 1 ? (rects[0] as DOMRect) : range.getBoundingClientRect();
  return r.width === 0 && r.height === 0 ? null : frame.toLocal(r);
}

/** The measured segments of one text node, in logical order. */
export function measureText(node: Text, style: RunStyle, direction: Segment["direction"], frame: Frame): Segment[] {
  const out: Segment[] = [];
  const text = node.data;
  const range = document.createRange();
  for (const { segment, index } of words.segment(text)) {
    range.setStart(node, index);
    range.setEnd(node, index + segment.length);
    const rects = range.getClientRects();
    if (rects.length === 0) continue;
    const whole = rects.length === 1 ? box(range, frame, false) : null;
    if (whole) {
      out.push({ text: segment, box: whole, style, direction });
      continue;
    }
    // A word broken across lines (or by bidi reordering): measure each grapheme
    for (const g of graphemes.segment(segment)) {
      range.setStart(node, index + g.index);
      range.setEnd(node, index + g.index + g.segment.length);
      const b = box(range, frame, true);
      if (b) out.push({ text: g.segment, box: b, style, direction });
    }
  }
  range.detach();
  return out;
}
