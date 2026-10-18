import { describe, expect, it } from "vitest";
import { SvgExportError, throwIfAborted } from "../../src/errors.js";
import { DEFAULT_LIMITS, resolveOptions } from "../../src/options.js";

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
      waitForFonts: true,
      fontTimeout: 3000,
      links: "preserve",
      textLength: true,
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
    const options = resolveOptions({
      padding: 0,
      background: "#FFF",
      title: "T",
      description: "D",
      idPrefix: "map-2",
      waitForFonts: false,
      fontTimeout: 0,
      links: "text",
      textLength: false,
      embedImages: false,
      resolveImage,
      strict: true,
      signal: controller.signal,
      limits: { maxNodes: 5, maxImages: undefined },
    });
    expect(options).toMatchObject({
      padding: 0,
      background: { hex: "#ffffff", alpha: 1 },
      waitForFonts: false,
      links: "text",
      textLength: false,
      strict: true,
    });
    expect(options.resolveImage).toBe(resolveImage);
    expect(options.limits).toEqual({ ...DEFAULT_LIMITS, maxNodes: 5 });
    expect(resolveOptions({ background: "transparent" }).background).toBeNull();
    expect(resolveOptions({ background: " Theme " }).background).toBe("theme");
    expect(resolveOptions({ background: "rgba(0,0,0,.5)" }).background).toEqual({ hex: "#000000", alpha: 0.5 });
  });

  it("refuses invalid options", () => {
    expect(invalid(null)).toMatch(/object/);
    expect(invalid({ padding: -1 })).toMatch(/padding/);
    expect(invalid({ padding: Number.NaN })).toMatch(/padding/);
    expect(invalid({ padding: "4" })).toMatch(/padding/);
    expect(invalid({ fontTimeout: Infinity })).toMatch(/fontTimeout/);
    expect(invalid({ background: "url(x)" })).toMatch(/background/);
    expect(invalid({ background: 3 })).toMatch(/background/);
    expect(invalid({ title: 1 })).toMatch(/title/);
    expect(invalid({ idPrefix: "1abc" })).toMatch(/idPrefix/);
    expect(invalid({ idPrefix: 'a"><script>' })).toMatch(/idPrefix/);
    expect(invalid({ links: "all" })).toMatch(/links/);
    expect(invalid({ resolveImage: "x" })).toMatch(/resolveImage/);
    expect(invalid({ signal: {} })).toMatch(/signal/);
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
