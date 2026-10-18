import { describe, expect, it } from "vitest";
import { arialMeasurer, type Font } from "../../src/text/measure.js";
import { wrapText } from "../../src/text/wrap.js";

const f16: Font = { size: 16, weight: 400, style: "normal" };
const bold: Font = { size: 20, weight: 700, style: "normal" };
const w = (text: string, font = f16) => arialMeasurer.width(text, font);

describe("arialMeasurer", () => {
  it("measures Arial's advances, regular and bold", () => {
    // As Chromium measures Arial (16px): A 0.667em, space 0.278em, € 0.556em
    expect(w("A")).toBeCloseTo(10.672, 3);
    expect(w(" ")).toBeCloseTo(4.448, 3);
    expect(w("€")).toBeCloseTo(8.896, 3);
    // "second line" in bold 20px is 110.03px in Chromium
    expect(w("second line", bold)).toBeCloseTo(110.04, 1);
    expect(w("")).toBe(0);
    expect(w("AB", { size: 32, weight: 400, style: "italic" })).toBeCloseTo(2 * w("AB"), 6);
  });

  it("gives accented letters it lacks the width of their base letter, and marks none", () => {
    expect(w("e\u0301")).toBeCloseTo(w("e"), 6);
    // \u0958 is not in the tables: \u0915 plus a nukta (a combining mark)
    expect(w("\u0958")).toBeCloseTo(w("\u0915"), 6);
    expect(w("a\u200bb\ufe0f")).toBeCloseTo(w("ab"), 6);
  });

  it("estimates emoji, CJK, Hangul, Arabic and other scripts", () => {
    for (const emoji of ["😀", "👍🏽", "👩‍👩‍👧", "🇪🇸", "🔗"]) expect(w(emoji)).toBeCloseTo(1.2 * 16, 6);
    expect(w("数")).toBe(16);
    expect(w("の")).toBe(16);
    expect(w("𠀀")).toBe(16);
    expect(w("한")).toBeCloseTo(0.865 * 16, 6);
    expect(w("م")).toBeCloseTo(0.32 * 16, 6);
    expect(w("ᚠ")).toBeCloseTo(0.556 * 16, 6);
  });
});

describe("wrapText", () => {
  const lines = (text: string, width: number) => wrapText(text, f16, width, arialMeasurer).map((l) => l.text);

  it("keeps a line that fits, and breaks at spaces when the next word does not", () => {
    expect(lines("one two three", 1000)).toEqual(["one two three"]);
    const space = w(" ");
    const limit = w("one two") + space / 2;
    expect(lines("one two three", limit)).toEqual(["one two", "three"]);
    const [first] = wrapText("one two three", f16, limit, arialMeasurer);
    expect(first?.width).toBeCloseTo(w("one two"), 6);
  });

  it("breaks at line feeds, keeps leading spaces and lets trailing ones hang", () => {
    expect(lines("first\nsecond\r\nthird\rfourth", 1000)).toEqual(["first", "second", "third", "fourth"]);
    expect(lines("  indented   \n\nafter blank", 1000)).toEqual(["  indented", "", "after blank"]);
    expect(lines("a\tb", 1000)).toEqual(["a b"]);
    expect(lines("", 100)).toEqual([""]);
    expect(lines("   ", 100)).toEqual([""]);
  });

  it("never breaks inside a word, which overflows instead", () => {
    expect(lines("Supercalifragilistic short", 50)).toEqual(["Supercalifragilistic", "short"]);
  });

  it("can break between CJK characters", () => {
    expect(lines("数学数学数学", 40)).toEqual(["数学", "数学", "数学"]);
  });

  it("is linear: a 100,000-character label wraps quickly", () => {
    const long = "palabra ".repeat(12_500);
    const start = performance.now();
    const result = wrapText(long, f16, 560, arialMeasurer);
    expect(performance.now() - start).toBeLessThan(500);
    expect(result.length).toBeGreaterThan(1000);
    expect(result.every((l) => l.width <= 560)).toBe(true);
  });
});
