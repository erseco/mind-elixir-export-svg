import { describe, expect, it } from "vitest";
import { layoutLines, type RunStyle, type Segment } from "../../src/text/lines.js";

const style = (overrides: Partial<RunStyle> = {}): RunStyle => ({
  fontFamily: "sans-serif",
  fontSize: 16,
  fontWeight: "400",
  fontStyle: "normal",
  fill: { hex: "#000000", alpha: 1 },
  decoration: [],
  letterSpacing: 0,
  ascent: 15,
  descent: 4,
  ...overrides,
});

// A segment on a line whose content box starts at `top`, as the browser reports it
const seg = (
  text: string,
  x: number,
  top: number,
  width: number,
  s: RunStyle,
  height = s.ascent + s.descent,
  direction: "ltr" | "rtl" = "ltr",
): Segment => ({
  text,
  box: { x, y: top, width, height },
  style: s,
  direction,
});

describe("layoutLines", () => {
  it("keeps the browser's line breaks and puts each line on its baseline", () => {
    const s = style();
    const { runs, bounds } = layoutLines([
      seg("Learning", 10, 0, 60, s),
      seg(" ", 70, 0, 4, s),
      seg("through", 74, 0, 55, s),
      seg(" ", 129, 0, 4, s),
      seg("collaborative", 10, 22, 90, s),
    ]);
    expect(runs.map((r) => [r.text, r.x, r.y, r.width])).toEqual([
      ["Learning through", 10, 15, 119],
      ["collaborative", 10, 37, 90],
    ]);
    // The trailing space is not drawn, so it is not in the bounds
    expect(bounds).toEqual({ x: 10, y: 0, width: 119, height: 41 });
  });

  it("drops explicit line breaks and blank ends of lines", () => {
    const s = style();
    const { runs } = layoutLines([
      seg("  ", 0, 0, 8, s),
      seg("one", 8, 0, 20, s),
      seg("\n", 28, 0, 0, s),
      seg("two", 0, 20, 20, s),
      seg("x", 0, 40, 5, s, 0),
    ]);
    expect(runs.map((r) => r.text)).toEqual(["one", "two"]);
    expect(runs[0]?.x).toBe(8);
  });

  it("splits a line into runs where the style or direction changes", () => {
    const plain = style();
    const bold = style({ fontWeight: "700" });
    const { runs } = layoutLines([
      seg("Second ", 0, 0, 50, plain),
      seg("bold", 50, 0, 30, bold),
      seg("שלום", 80, 0, 30, bold, undefined, "rtl"),
    ]);
    expect(runs.map((r) => [r.text, r.fontWeight, r.direction, r.x])).toEqual([
      ["Second ", "400", "ltr", 0],
      ["bold", "700", "ltr", 50],
      // A right-to-left run starts at its right edge
      ["שלום", "700", "rtl", 110],
    ]);
    expect(runs[0]).not.toHaveProperty("ascent");
  });

  it("takes the baseline from primary-font text when a fallback glyph is taller", () => {
    const s = style();
    // The emoji box is 25px tall and starts 3px higher than the text on the same line
    const { runs } = layoutLines([seg("Hi", 0, 10, 15, s), seg("😀", 15, 7, 20, s, 25)]);
    expect(runs.map((r) => r.y)).toEqual([25]);
    // A line of fallback glyphs only uses them
    const alone = layoutLines([seg("😀", 0, 7, 20, s, 25)]);
    expect(alone.runs[0]?.y).toBe(7 + (25 - 19) / 2 + 15);
  });

  it("returns nothing for no text", () => {
    expect(layoutLines([])).toEqual({ runs: [], bounds: null });
    expect(layoutLines([seg(" ", 0, 0, 4, style())])).toEqual({ runs: [], bounds: null });
  });
});
