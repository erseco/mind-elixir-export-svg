import { describe, expect, it } from "vitest";
import {
  IDENTITY,
  geometryPath,
  inflate,
  isFiniteBox,
  isIdentity,
  multiply,
  roundedRectPath,
  transformAttribute,
  transformBox,
  uniformRadii,
  union,
  type Matrix,
} from "../../src/geometry.js";

const r = (x: number, y = x) => ({ x, y });

describe("boxes", () => {
  it("unions boxes, or returns null for none", () => {
    expect(union([])).toBeNull();
    expect(
      union([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: -5, y: 5, width: 2, height: 20 },
      ]),
    ).toEqual({ x: -5, y: 0, width: 15, height: 25 });
  });

  it("inflates and checks boxes", () => {
    expect(inflate({ x: 0, y: 0, width: 10, height: 4 }, 2)).toEqual({ x: -2, y: -2, width: 14, height: 8 });
    expect(isFiniteBox({ x: 0, y: 0, width: 1, height: 1 })).toBe(true);
    expect(isFiniteBox({ x: Number.NaN, y: 0, width: 1, height: 1 })).toBe(false);
    expect(isFiniteBox({ x: 0, y: 0, width: -1, height: 1 })).toBe(false);
  });

  it("transforms boxes by scale, translation and rotation", () => {
    expect(transformBox({ x: 1, y: 2, width: 3, height: 4 }, [2, 0, 0, 3, 10, 20])).toEqual({
      x: 12,
      y: 26,
      width: 6,
      height: 12,
    });
    const rotated = transformBox({ x: 0, y: 0, width: 2, height: 1 }, [0, 1, -1, 0, 0, 0]);
    expect(rotated.x).toBeCloseTo(-1);
    expect(rotated.width).toBeCloseTo(1);
    expect(rotated.height).toBeCloseTo(2);
  });
});

describe("matrices", () => {
  it("composes so the right-hand matrix applies first", () => {
    const scale: Matrix = [2, 0, 0, 2, 0, 0];
    const move: Matrix = [1, 0, 0, 1, 5, 7];
    expect(multiply(move, scale)).toEqual([2, 0, 0, 2, 5, 7]);
    expect(multiply(scale, move)).toEqual([2, 0, 0, 2, 10, 14]);
    expect(isIdentity(multiply(IDENTITY, IDENTITY))).toBe(true);
  });

  it("writes the shortest transform attribute", () => {
    expect(transformAttribute(IDENTITY)).toBeUndefined();
    expect(transformAttribute([1, 0, 0, 1, 3.456, -2])).toBe("translate(3.46 -2)");
    expect(transformAttribute([0.017578125, 0, 0, 0.017578125, 10, 20])).toBe("matrix(0.017578 0 0 0.017578 10 20)");
    expect(() => transformAttribute([Number.NaN, 0, 0, 1, 0, 0])).toThrow(RangeError);
  });
});

describe("rounded rectangles", () => {
  it("detects uniform radii", () => {
    expect(uniformRadii([r(2), r(2), r(2), r(2)])).toBe(true);
    expect(uniformRadii([r(2), r(2), r(2, 3), r(2)])).toBe(false);
  });

  it("draws per-corner radii, with straight corners where a radius is 0", () => {
    expect(roundedRectPath({ x: 0, y: 0, width: 10, height: 6 }, [r(2), r(0), r(1, 2), r(0, 3)])).toBe(
      "M2 0H10L10 0V4A1 2 0 0 1 9 6H0L0 6V2A2 2 0 0 1 2 0Z",
    );
  });
});

describe("geometryPath", () => {
  const attrs = (values: Record<string, string>) => (name: string) => values[name] ?? null;

  it("converts each geometry element", () => {
    expect(geometryPath("line", attrs({ x1: "0", y1: "1", x2: "10px", y2: "2.5" }))).toBe("M0 1L10 2.5");
    expect(geometryPath("polyline", attrs({ points: "0,0 10,0 10 10" }))).toBe("M0 0L10 0L10 10");
    expect(geometryPath("polygon", attrs({ points: "0 0, 5 5" }))).toBe("M0 0L5 5Z");
    expect(geometryPath("rect", attrs({ width: "10", height: "6", rx: "2" }))).toBe(
      "M2 0H8A2 2 0 0 1 10 2V4A2 2 0 0 1 8 6H2A2 2 0 0 1 0 4V2A2 2 0 0 1 2 0Z",
    );
    expect(geometryPath("rect", attrs({ x: "1", y: "1", width: "4", height: "4", ry: "9" }))).toContain("A2 2");
    expect(geometryPath("rect", attrs({ width: "4", height: "4" }))).toBe("M0 0H4L4 0V4L4 4H0L0 4V0L0 0Z");
    expect(geometryPath("circle", attrs({ cx: "5", cy: "5", r: "5" }))).toBe("M0 5A5 5 0 1 0 10 5A5 5 0 1 0 0 5Z");
    expect(geometryPath("ellipse", attrs({ cx: "0", cy: "0", rx: "2", ry: "1" }))).toBe(
      "M-2 0A2 1 0 1 0 2 0A2 1 0 1 0 -2 0Z",
    );
  });

  it("refuses units, percentages, degenerate shapes and other elements", () => {
    expect(geometryPath("line", attrs({ x1: "10%" }))).toBeNull();
    expect(geometryPath("polyline", attrs({ points: "0 0 1" }))).toBeNull();
    expect(geometryPath("polyline", attrs({ points: "0 0 1 x" }))).toBeNull();
    expect(geometryPath("polyline", attrs({}))).toBeNull();
    expect(geometryPath("rect", attrs({ width: "0", height: "4" }))).toBeNull();
    expect(geometryPath("rect", attrs({ width: "4", height: "0" }))).toBeNull();
    expect(geometryPath("rect", attrs({ width: "4em", height: "4" }))).toBeNull();
    expect(geometryPath("circle", attrs({ cx: "0", cy: "0", r: "0" }))).toBeNull();
    expect(geometryPath("circle", attrs({ cx: "0", cy: "0", r: "1in" }))).toBeNull();
    expect(geometryPath("ellipse", attrs({ rx: "2", ry: "0" }))).toBeNull();
    expect(geometryPath("text", attrs({}))).toBeNull();
  });
});
