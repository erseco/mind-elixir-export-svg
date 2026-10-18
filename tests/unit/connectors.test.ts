import { describe, expect, it } from "vitest";
import {
  arrowGeometry,
  defaultDeltas,
  mainBranch,
  roundedVertical,
  subBranch,
  summaryGeometry,
} from "../../src/connectors.js";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("branches", () => {
  it("curves main branches from near the root's centre to the main topic's inner edge", () => {
    const root = box(100, 100, 200, 50);
    // pct = |150 - 125| / 500 = 0.05; offset = 0.95 * 0.25 * 100 = 23.75; x1 = 200 + 20 + 23.75
    expect(mainBranch(root, box(400, 130, 100, 40), "rhs", 500)).toBe("M 243.75 125 Q 243.75 150 400 150");
    expect(mainBranch(root, box(0, 130, 50, 40), "lhs", 500)).toBe("M 156.25 125 Q 156.25 150 50 150");
    expect(mainBranch(root, box(200, 300, 100, 40), "down", 500)).toBe(roundedVertical(200, 150, 250, 300));
  });

  it("draws sub-branches as Mind Elixir does, from the side or the bottom of the parent", () => {
    const parent = box(100, 100, 100, 40);
    const child = box(260, 160, 80, 30);
    // isFirst: from the middle of a main node; offset = |120 - 190| / 300 * 30 = 7
    expect(subBranch(parent, child, "rhs", true, 30)).toBe("M 170 120 C 200 120 193 190 230 190 H 310");
    expect(subBranch(parent, child, "rhs", false, 30)).toBe("M 170 140 C 200 140 195 190 230 190 H 310");
    expect(subBranch(parent, box(-60, 160, 80, 30), "lhs", false, 30)).toBe("M 130 140 C 100 140 105 190 70 190 H -30");
    expect(subBranch(parent, child, "down", true, 30)).toBe(roundedVertical(150, 140, 300, 160));
  });

  it("rounds the corners of top-down connectors, straight when aligned", () => {
    expect(roundedVertical(10, 0, 10, 50)).toBe("M 10 0 V 50");
    expect(roundedVertical(0, 0, 100, 40)).toBe("M 0 0 V 12 Q 0 20 8 20 H 92 Q 100 20 100 28 V 40");
    expect(roundedVertical(100, 0, 0, 10)).toBe("M 100 0 V 0 Q 100 5 95 5 H 5 Q 0 5 0 10 V 10");
  });
});

describe("arrows", () => {
  const a = box(0, 0, 100, 40);

  it("picks Mind Elixir's default control points by distance and direction", () => {
    // Close: a C-shaped curve away from the side (or from the target when there is no side)
    expect(defaultDeltas(a, box(50, 60, 100, 40), "lhs")).toEqual({
      delta1: { x: -200, y: 0 },
      delta2: { x: -200, y: 0 },
    });
    expect(defaultDeltas(a, box(50, 60, 100, 40), "rhs").delta1.x).toBe(200);
    expect(defaultDeltas(a, box(50, 60, 100, 40), undefined).delta1.x).toBe(-200);
    expect(defaultDeltas(a, box(-50, 60, 100, 40), undefined).delta1.x).toBe(200);
    // Horizontal: from the facing edges, 30% of the distance (at least 50)
    expect(defaultDeltas(a, box(400, 0, 100, 40), "rhs")).toEqual({
      delta1: { x: 170, y: 0 },
      delta2: { x: -170, y: 0 },
    });
    expect(defaultDeltas(box(400, 0, 100, 40), a, "rhs")).toEqual({
      delta1: { x: -170, y: 0 },
      delta2: { x: 170, y: 0 },
    });
    // Vertical
    expect(defaultDeltas(a, box(0, 400, 100, 40), "rhs")).toEqual({
      delta1: { x: 0, y: 140 },
      delta2: { x: 0, y: -140 },
    });
    expect(defaultDeltas(box(0, 400, 100, 40), a, "rhs")).toEqual({
      delta1: { x: 0, y: -140 },
      delta2: { x: 0, y: 140 },
    });
    // Diagonal, both ways
    const d = defaultDeltas(a, box(300, 300, 100, 40), "rhs");
    expect(d.delta1.x).toBeGreaterThan(0);
    expect(d.delta2.y).toBeLessThan(0);
    const back = defaultDeltas(box(300, 300, 100, 40), a, "rhs");
    expect(back.delta1.x).toBeLessThan(0);
  });

  it("leaves each topic where the line to its control point crosses its border", () => {
    const g = arrowGeometry(a, box(400, 0, 100, 40), { x: 170, y: 0 }, { x: -170, y: 0 }, false);
    expect(g.line).toBe("M 100 20 C 220 20 280 20 400 20");
    expect(g.heads).toHaveLength(1);
    expect(g.middle).toEqual({ x: 250, y: 20 });
    const both = arrowGeometry(a, box(400, 0, 100, 40), { x: 170, y: 0 }, { x: -170, y: 0 }, true);
    expect(both.heads).toHaveLength(2);
    // The head at the end points back along the curve, 12px long at ±30°
    const [x1, y1] = both.heads[0]!.slice(2).split(" ").map(Number) as [number, number];
    expect(Math.hypot(x1 - 400, y1 - 20)).toBeCloseTo(12, 6);
  });

  it("starts from the centre when the control point is the centre or the box is empty", () => {
    expect(arrowGeometry(a, box(400, 0, 0, 0), { x: 0, y: 0 }, { x: 0, y: 0 }, false).line).toBe(
      "M 50 20 C 50 20 400 0 400 0",
    );
    expect(arrowGeometry(a, box(400, 0, 0, 0), { x: 0, y: 0 }, { x: -50, y: 0 }, false).line).toBe(
      "M 50 20 C 50 20 350 0 400 0",
    );
  });
});

describe("summaries", () => {
  const items = [box(100, 0, 120, 40), box(100, 40, 160, 40)];

  it("brackets siblings on the right, left or below, with the label beside it", () => {
    expect(summaryGeometry(items, "rhs", true)).toEqual({
      path: "M 250 30 c 5 0 10 5 10 10 L 260 60 c 0 5 -5 10 -10 10 M 260 50 h 10",
      label: { x: 280, y: 50, anchor: "start" },
    });
    expect(summaryGeometry(items, "lhs", false)).toEqual({
      path: "M 110 20 c -5 0 -10 5 -10 10 L 100 50 c 0 5 5 10 10 10 M 100 40 h -10",
      label: { x: 80, y: 40, anchor: "end" },
    });
    const one = summaryGeometry([box(0, 0, 100, 40)], "down", true);
    expect(one).toEqual({
      path: "M 10 40 c 0 5 5 10 10 10 L 80 50 c 5 0 10 -5 10 -10 M 50 50 v 10",
      label: { x: 50, y: 70, anchor: "middle" },
    });
  });
});
