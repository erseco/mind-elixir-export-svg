import { union, type Box } from "../geometry.js";
import type { TextRun } from "../scene.js";

/** The style of a run of text, with the metrics of its primary font. */
export interface RunStyle extends Omit<TextRun, "text" | "x" | "y" | "width" | "direction"> {
  /** `fontBoundingBoxAscent` of the primary font at this size. */
  ascent: number;
  /** `fontBoundingBoxDescent` of the primary font at this size. */
  descent: number;
}

/** A word or grapheme with the box the browser drew it in, in logical order. */
export interface Segment {
  text: string;
  box: Box;
  style: RunStyle;
  direction: "ltr" | "rtl";
}

export interface Lines {
  runs: TextRun[];
  bounds: Box | null;
}

const isBreak = (text: string) => /^[\r\n\u2028\u2029]+$/.test(text);
const isBlank = (text: string) => /^\s*$/.test(text);

function overlapsLine(box: Box, line: Box): boolean {
  const overlap = Math.min(box.y + box.height, line.y + line.height) - Math.max(box.y, line.y);
  return overlap > 0.5 * Math.min(box.height, line.height);
}

/**
 * The baseline of a line. Text boxes of the primary font are `ascent + descent` tall (WebKit
 * adds a little, split evenly), so their baseline is exact; glyphs from fallback fonts (emoji,
 * CJK) can have taller boxes and are only used when the line has nothing else.
 */
function baseline(line: Segment[]): number {
  const estimate = (s: Segment) => {
    const content = s.style.ascent + s.style.descent;
    return s.box.y + (s.box.height - content) / 2 + s.style.ascent;
  };
  const primary = line.filter((s) => Math.abs(s.box.height - (s.style.ascent + s.style.descent)) < 1);
  const pool = primary.length ? primary : line;
  const values = pool.map(estimate).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] as number;
}

/**
 * Groups measured segments into lines (by their vertical position, so the browser's wrapping
 * is kept exactly) and each line into runs of one style and direction, positioned where the
 * browser drew them. Line breaks and blank space at the ends of a line are dropped: they draw
 * nothing, and every run carries its own position.
 */
export function layoutLines(segments: readonly Segment[]): Lines {
  const lines: Segment[][] = [];
  let band: Box | null = null;
  for (const s of segments) {
    if (isBreak(s.text) || s.box.height <= 0) continue;
    const current = lines[lines.length - 1];
    if (current && band && overlapsLine(s.box, band)) {
      current.push(s);
      band = union([band, s.box]) as Box;
    } else {
      lines.push([s]);
      band = s.box;
    }
  }

  const runs: TextRun[] = [];
  const drawn: Box[] = [];
  for (const segmentsOfLine of lines) {
    let first = 0;
    let last = segmentsOfLine.length - 1;
    while (first <= last && isBlank((segmentsOfLine[first] as Segment).text)) first++;
    while (last >= first && isBlank((segmentsOfLine[last] as Segment).text)) last--;
    const line = segmentsOfLine.slice(first, last + 1);
    if (!line.length) continue;
    const y = baseline(line);
    let run: Segment[] = [];
    // Called with at least one segment: a line is never empty here
    const flush = () => {
      const head = run[0] as Segment;
      const box = union(run.map((s) => s.box)) as Box;
      const { ascent: _a, descent: _d, ...style } = head.style;
      runs.push({
        ...style,
        text: run.map((s) => s.text).join(""),
        x: head.direction === "rtl" ? box.x + box.width : box.x,
        y,
        width: box.width,
        direction: head.direction,
      });
      drawn.push(box);
      run = [];
    };
    for (const s of line) {
      const head = run[0];
      if (head && (head.style !== s.style || head.direction !== s.direction)) flush();
      run.push(s);
    }
    flush();
  }
  return { runs, bounds: union(drawn) };
}
