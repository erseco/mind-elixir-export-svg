import type { Font, TextMeasurer } from "./measure.js";

export interface Line {
  /** The line's text, without the spaces it ends with (they hang and draw nothing). */
  text: string;
  width: number;
}

// Break opportunities, as CSS has them for most text: after spaces, and between characters of
// scripts written without spaces (CJK)
const TOKEN =
  /[ \t]+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]|[^ \t\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]+/gu;

/**
 * Breaks text as `white-space: pre-wrap` does in a box `maxWidth` wide: at line feeds, then
 * where the next word would not fit. A word longer than the line is not broken (it overflows,
 * as `overflow-wrap: normal` does). Tabs are drawn as spaces. Leading spaces of a paragraph
 * are kept; spaces at a break hang at the end of the line and are dropped.
 */
export function wrapText(text: string, font: Font, maxWidth: number, measure: TextMeasurer): Line[] {
  const lines: Line[] = [];
  const width = (s: string) => measure.width(s, font);
  for (const paragraph of text.replace(/\r\n?/g, "\n").replace(/\t/g, " ").split("\n")) {
    // Token widths are added up to find the breaks (linear in the length of the text)
    let current = "";
    let currentWidth = 0;
    let trailing = "";
    let trailingWidth = 0;
    for (const token of paragraph.match(TOKEN) ?? []) {
      const w = width(token);
      if (/^ +$/.test(token)) {
        // Spaces never start a break: they hang at the end of the line
        trailing += token;
        trailingWidth += w;
        continue;
      }
      if (current !== "" && currentWidth + trailingWidth + w > maxWidth) {
        lines.push({ text: current, width: currentWidth });
        current = token;
        currentWidth = w;
      } else {
        current += trailing + token;
        currentWidth += trailingWidth + w;
      }
      trailing = "";
      trailingWidth = 0;
    }
    lines.push({ text: current, width: currentWidth });
  }
  // Breaks are found with token widths added up; each line is then measured whole, so the
  // kerning between its words (and the space) counts too
  return lines.map((l) => ({ text: l.text, width: width(l.text) }));
}
