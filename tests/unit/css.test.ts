import { describe, expect, it } from "vitest";
import {
  clampRadii,
  decorationLines,
  fontFamily,
  fontWeight,
  parseColor,
  parseCornerRadius,
  parsePx,
  type Radii,
} from "../../src/css.js";

describe("parseColor", () => {
  it("reads computed rgb() and rgba() in both syntaxes", () => {
    expect(parseColor("rgb(192, 57, 43)")).toEqual({ hex: "#c0392b", alpha: 1 });
    expect(parseColor("rgba(0, 0, 0, 0.5)")).toEqual({ hex: "#000000", alpha: 0.5 });
    expect(parseColor("rgb(255 128 0 / 25%)")).toEqual({ hex: "#ff8000", alpha: 0.25 });
    expect(parseColor("rgb(100%, 0%, 50%)")).toEqual({ hex: "#ff0080", alpha: 1 });
    expect(parseColor("RGBA(300, -5, 10, 2)")).toEqual({ hex: "#ff000a", alpha: 1 });
  });

  it("reads hex colours and transparent", () => {
    expect(parseColor("#abc")).toEqual({ hex: "#aabbcc", alpha: 1 });
    expect(parseColor("#abcd")).toEqual({ hex: "#aabbcc", alpha: 0xdd / 255 });
    expect(parseColor("#A1B2C3")).toEqual({ hex: "#a1b2c3", alpha: 1 });
    expect(parseColor("#a1b2c380")).toEqual({ hex: "#a1b2c3", alpha: 0x80 / 255 });
    expect(parseColor("transparent")).toEqual({ hex: "#000000", alpha: 0 });
  });

  it("reads the CSS named colours", () => {
    expect(parseColor("red")).toEqual({ hex: "#ff0000", alpha: 1 });
    expect(parseColor(" RebeccaPurple ")).toEqual({ hex: "#663399", alpha: 1 });
  });

  it("refuses what it does not understand", () => {
    for (const v of [
      "oklch(70% 0.1 200)",
      "color(srgb 1 0 0)",
      "currentcolor",
      "notacolour",
      "rgb(1, 2)",
      "rgb(1, 2, 3, 4, 5)",
      "rgb(a, b, c)",
      "#12",
      "url(x)",
    ]) {
      expect(parseColor(v)).toBeNull();
    }
  });
});

describe("lengths and radii", () => {
  it("parses px lengths only", () => {
    expect(parsePx("12px")).toBe(12);
    expect(parsePx(" 0 ")).toBe(0);
    expect(parsePx("1.5e-1px")).toBe(0.15);
    expect(parsePx("2em")).toBeNaN();
    expect(parsePx("auto")).toBeNaN();
  });

  it("resolves corner radii, elliptical and in percent", () => {
    expect(parseCornerRadius("8px", 100, 50)).toEqual({ x: 8, y: 8 });
    expect(parseCornerRadius("8px 4px", 100, 50)).toEqual({ x: 8, y: 4 });
    expect(parseCornerRadius("50%", 100, 50)).toEqual({ x: 50, y: 25 });
    expect(parseCornerRadius("10% 20%", 100, 50)).toEqual({ x: 10, y: 10 });
    expect(parseCornerRadius("auto", 100, 50)).toEqual({ x: 0, y: 0 });
    expect(parseCornerRadius("-4px", 100, 50)).toEqual({ x: 0, y: 0 });
  });

  it("scales radii that do not fit, as CSS does", () => {
    const big = { x: 40, y: 40 };
    const r: Radii = [big, big, big, big];
    expect(clampRadii(r, 60, 100)).toEqual([...Array(4)].map(() => ({ x: 30, y: 30 })));
    expect(clampRadii(r, 200, 200)).toBe(r);
    const zero = { x: 0, y: 0 };
    expect(clampRadii([zero, zero, zero, zero], 10, 10)[0]).toEqual(zero);
  });
});

describe("text styles", () => {
  it("lists decoration lines", () => {
    expect(decorationLines("underline line-through")).toEqual(["underline", "line-through"]);
    expect(decorationLines("line-through overline underline")).toEqual(["underline", "overline", "line-through"]);
    expect(decorationLines("none")).toEqual([]);
  });

  it("normalizes font weights", () => {
    expect(fontWeight("normal")).toBe("400");
    expect(fontWeight("bold")).toBe("700");
    expect(fontWeight("650")).toBe("650");
    expect(fontWeight("bolder")).toBe("400");
    expect(fontWeight("2000")).toBe("400");
  });

  it("re-quotes font families safely", () => {
    expect(fontFamily('-apple-system, "system-ui", "Helvetica Neue", sans-serif')).toBe(
      "-apple-system, system-ui, 'Helvetica Neue', sans-serif",
    );
    expect(fontFamily("'Noto Sans CJK SC', Arial")).toBe("'Noto Sans CJK SC', Arial");
    // Whatever a family name contains, quoted names are closed and carry no quote or backslash
    for (const hostile of [`"Evil'\\"Font", serif`, `'a\\', 'b'`, `"x', y"`]) {
      const out = fontFamily(hostile);
      expect(out.split("'").length % 2).toBe(1);
      expect(out).not.toMatch(/["\\]/);
    }
    expect(fontFamily("")).toBe("sans-serif");
    expect(fontFamily(" , ")).toBe("sans-serif");
  });
});
