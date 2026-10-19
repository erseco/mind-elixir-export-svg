import { describe, expect, it } from "vitest";
import { SvgExportError, throwIfAborted } from "../../src/errors.js";
import { DEFAULT_FONT_FAMILY, DEFAULT_LIMITS, resolveOptions } from "../../src/options.js";
import { arialMeasurer } from "../../src/text/measure.js";
import { DARK_THEME } from "../../src/theme.js";

const invalid = (options: unknown) => {
  try {
    resolveOptions(options as never);
  } catch (error) {
    expect(error).toBeInstanceOf(SvgExportError);
    expect((error as SvgExportError).code).toBe("INVALID_OPTIONS");
    return (error as Error).message;
  }
  throw new Error("expected INVALID_OPTIONS");
};

describe("resolveOptions", () => {
  it("fills in safe defaults", () => {
    expect(resolveOptions()).toEqual({
      padding: 24,
      background: "theme",
      title: undefined,
      description: "",
      idPrefix: "mindmap-svg",
      theme: undefined,
      direction: undefined,
      fontFamily: DEFAULT_FONT_FAMILY,
      measure: arialMeasurer,
      links: "preserve",
      textLength: true,
      textDecoration: false,
      embedImages: true,
      resolveImage: undefined,
      strict: false,
      signal: undefined,
      limits: DEFAULT_LIMITS,
    });
  });

  it("accepts every documented option", () => {
    const controller = new AbortController();
    const resolveImage = () => null;
    const measureText = { width: () => 1, vertical: { ascent: 1, descent: 0, lineGap: 0, xHeight: 0.5 } };
    const options = resolveOptions({
      padding: 0,
      background: "#FFF",
      title: "T",
      description: "D",
      idPrefix: "map-2",
      theme: DARK_THEME,
      direction: 3,
      fontFamily: "Inter, sans-serif",
      measureText,
      links: "text",
      textLength: false,
      textDecoration: true,
      embedImages: false,
      resolveImage,
      strict: true,
      signal: controller.signal,
      limits: { maxNodes: 5, maxImages: undefined },
    });
    expect(options).toMatchObject({
      padding: 0,
      background: { hex: "#ffffff", alpha: 1 },
      theme: DARK_THEME,
      direction: 3,
      fontFamily: "Inter, sans-serif",
      measure: measureText,
      links: "text",
      textLength: false,
      textDecoration: true,
      strict: true,
    });
    expect(options.resolveImage).toBe(resolveImage);
    expect(options.limits).toEqual({ ...DEFAULT_LIMITS, maxNodes: 5 });
    expect(resolveOptions({ background: "transparent" }).background).toBeNull();
    expect(resolveOptions({ background: " Theme " }).background).toBe("theme");
    expect(resolveOptions({ background: "white" }).background).toEqual({ hex: "#ffffff", alpha: 1 });
  });

  it("refuses invalid options", () => {
    expect(invalid(null)).toMatch(/object/);
    expect(invalid({ padding: -1 })).toMatch(/padding/);
    expect(invalid({ padding: Number.NaN })).toMatch(/padding/);
    expect(invalid({ padding: "4" })).toMatch(/padding/);
    expect(invalid({ background: "url(x)" })).toMatch(/background/);
    expect(invalid({ background: 3 })).toMatch(/background/);
    expect(invalid({ title: 1 })).toMatch(/title/);
    expect(invalid({ idPrefix: "1abc" })).toMatch(/idPrefix/);
    expect(invalid({ idPrefix: 'a"><script>' })).toMatch(/idPrefix/);
    expect(invalid({ links: "all" })).toMatch(/links/);
    expect(invalid({ resolveImage: "x" })).toMatch(/resolveImage/);
    expect(invalid({ signal: {} })).toMatch(/signal/);
    expect(invalid({ direction: 4 })).toMatch(/direction/);
    expect(invalid({ theme: { palette: "x", cssVar: {} } })).toMatch(/theme/);
    expect(invalid({ theme: { palette: [], cssVar: null } })).toMatch(/theme/);
    expect(invalid({ theme: { palette: [], cssVar: ["#fff"] } })).toMatch(/theme/);
    expect(invalid({ theme: null })).toMatch(/theme/);
    expect(resolveOptions({ theme: { type: "dark", palette: ["#111"] } }).theme).toEqual({
      type: "dark",
      palette: ["#111"],
    });
    expect(invalid({ fontFamily: "" })).toMatch(/fontFamily/);
    expect(invalid({ fontFamily: "Arial; } svg { display: none" })).toMatch(/fontFamily/);
    expect(invalid({ fontFamily: "url(x)" })).toMatch(/fontFamily/);
    expect(invalid({ fontFamily: "a".repeat(301) })).toMatch(/fontFamily/);
    expect(invalid({ measureText: () => 1 })).toMatch(/measureText/);
    expect(invalid({ measureText: null })).toMatch(/measureText/);
    expect(invalid({ measureText: { width: () => 1 } })).toMatch(/measureText/);
    expect(invalid({ measureText: { width: () => 1, vertical: null } })).toMatch(/measureText/);
    expect(
      invalid({ measureText: { width: () => 1, vertical: { ascent: 1, descent: 0, lineGap: 0, xHeight: Infinity } } }),
    ).toMatch(/measureText/);
    expect(invalid({ limits: 3 })).toMatch(/limits/);
    expect(invalid({ limits: { maxPages: 1 } })).toMatch(/Unknown limit/);
    expect(invalid({ limits: { maxNodes: 1.5 } })).toMatch(/integer/);
  });
});

describe("throwIfAborted", () => {
  it("throws ABORTED for an aborted signal only", () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(undefined)).not.toThrow();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(
      expect.objectContaining({ code: "ABORTED", name: "SvgExportError" }),
    );
  });
});
