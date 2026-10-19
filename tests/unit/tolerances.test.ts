import { describe, expect, it } from "vitest";
import { withinTolerance } from "../tolerances.js";

describe("withinTolerance", () => {
  const zero = { x: 0, y: 0, width: 0, height: 0 };

  it("matches the measured bounds for Arial, Firefox and fallback fonts", () => {
    expect(withinTolerance("three", "chromium", { ...zero, x: 0.1 })).toBe(true);
    expect(withinTolerance("three", "webkit", { ...zero, x: 0.11 })).toBe(false);
    expect(withinTolerance("deep", "chromium", { ...zero, y: 0.3 })).toBe(true);
    expect(withinTolerance("deep", "webkit", { ...zero, width: 0.31 })).toBe(false);
    expect(withinTolerance("large", "firefox", { x: 0.3, y: 500, width: 0.3, height: 3.5 })).toBe(true);
    expect(withinTolerance("large", "firefox", { ...zero, x: 0.31 })).toBe(false);
    expect(withinTolerance("unicode", "firefox", { x: 30, y: 100, width: 30, height: 8 })).toBe(true);
    expect(withinTolerance("unicode", "firefox", { ...zero, height: 8.1 })).toBe(false);
    expect(withinTolerance("rich", "chromium", { x: 30, y: 15, width: 0, height: 0 })).toBe(true);
    expect(withinTolerance("rich", "webkit", { ...zero, y: 15.1 })).toBe(false);
  });
});
