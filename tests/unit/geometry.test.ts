import { describe, expect, it } from "vitest";
import {
  IDENTITY,
  inflate,
  pathBounds,
  isFiniteBox,
  isIdentity,
  roundedRectPath,
  transformAttribute,
  uniformRadii,
  union,
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
});

describe("matrices", () => {
  it("detects the identity", () => {
    expect(isIdentity(IDENTITY)).toBe(true);
    expect(isIdentity([1, 0, 0, 1, 0, 1e-12])).toBe(true);
    expect(isIdentity([2, 0, 0, 1, 0, 0])).toBe(false);
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

describe("pathBounds", () => {
  it("covers end points and control points of absolute commands", () => {
    expect(pathBounds("M 10 20 L 30 5 H 50 V 40 Z")).toEqual({ x: 10, y: 5, width: 40, height: 35 });
    expect(pathBounds("M0 0 C 0 -10 100 -10 100 0 Q 120 30 90 40 S 0 0 5 5 T 1 1")).toEqual({
      x: 0,
      y: -10,
      width: 120,
      height: 50,
    });
  });

  it("follows relative commands and implicit lines after a move", () => {
    // The brackets Mind Elixir draws for summaries are relative
    expect(pathBounds("M 954 230 c 5 0 10 5 10 10 L 964 272 c 0 5 -5 10 -10 10 M 964 256 h 10")).toEqual({
      x: 954,
      y: 230,
      width: 20,
      height: 52,
    });
    // (10,10) → (15,15) → (15,-5) → (16,-4) → back to (10,10) → (12,12)
    expect(pathBounds("m 10 10 5 5 v -20 l 1 1 z t 2 2")).toEqual({ x: 10, y: -5, width: 6, height: 20 });
    expect(pathBounds("M 0 0 s 10 10 20 0 q 5 -5 10 0")).toEqual({ x: 0, y: -5, width: 30, height: 15 });
  });

  it("includes the radii of arcs, grows by a margin and skips what it does not know", () => {
    expect(pathBounds("M 10 10 A 5 5 0 0 1 20 10", 1)).toEqual({ x: 4, y: 4, width: 22, height: 12 });
    expect(pathBounds("M 0 0 a 2 3 0 1 0 4 0")).toEqual({ x: -2, y: -3, width: 8, height: 6 });
    expect(pathBounds("M 0 0 X 5 L 1 1")).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(pathBounds("")).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
