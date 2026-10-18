import { describe, expect, it } from "vitest";
import type { Color } from "../../src/css.js";
import type { BoxShape, ImageShape, PathShape, Shape, TextRun, TextShape } from "../../src/scene.js";
import { renderDocument, type DocumentOptions } from "../../src/svg/document.js";
import { elements, parseSvg } from "./helpers.js";

const black: Color = { hex: "#000000", alpha: 1 };
const red: Color = { hex: "#ff0000", alpha: 1 };
const r0 = { x: 0, y: 0 };
const r = (v: number) => ({ x: v, y: v });

const options = (overrides: Partial<DocumentOptions> = {}): DocumentOptions => ({
  padding: 10,
  background: null,
  title: "Map",
  description: "",
  idPrefix: "m",
  maxOutputLength: 1_000_000,
  textLength: false,
  ...overrides,
});

const box = (overrides: Partial<BoxShape> = {}): BoxShape => ({
  kind: "box",
  layer: "nodes",
  box: { x: 0, y: 0, width: 100, height: 40 },
  radii: [r(5), r(5), r(5), r(5)],
  fill: red,
  opacity: 1,
  ...overrides,
});

const run = (overrides: Partial<TextRun> = {}): TextRun => ({
  text: "Hello",
  x: 10,
  y: 20,
  width: 40,
  fontFamily: "sans-serif",
  fontSize: 16,
  fontWeight: "400",
  fontStyle: "normal",
  fill: black,
  decoration: [],
  letterSpacing: 0,
  direction: "ltr",
  ...overrides,
});

const text = (runs: TextRun[], overrides: Partial<TextShape> = {}): TextShape => ({
  kind: "text",
  layer: "nodes",
  runs,
  bounds: { x: 10, y: 5, width: 50, height: 20 },
  opacity: 1,
  ...overrides,
});

const render = (shapes: Shape[], o: Partial<DocumentOptions> = {}) => {
  const result = renderDocument(shapes, options(o));
  return { ...result, doc: parseSvg(result.svg) };
};

describe("renderDocument", () => {
  it("writes a standalone SVG sized to the content plus padding", () => {
    const { svg, width, height, viewBox, doc } = render([box({ box: { x: -20, y: 5, width: 100, height: 40 } })], {
      background: { hex: "#f6f6f6", alpha: 1 },
      description: "About it",
    });
    const root = doc.documentElement!;
    expect(root.localName).toBe("svg");
    expect(root.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect([width, height, viewBox]).toEqual([120, 60, "-30 -5 120 60"]);
    expect(root.getAttribute("role")).toBe("img");
    expect(root.getAttribute("aria-labelledby")).toBe("m-title");
    expect(root.getAttribute("aria-describedby")).toBe("m-desc");
    expect(doc.getElementsByTagName("title")[0]?.textContent).toBe("Map");
    expect(doc.getElementsByTagName("desc")[0]?.textContent).toBe("About it");
    // The background covers the whole frame
    const bg = doc.getElementsByTagName("rect")[0]!;
    expect(["x", "y", "width", "height", "fill"].map((a) => bg.getAttribute(a))).toEqual([
      "-30",
      "-5",
      "120",
      "60",
      "#f6f6f6",
    ]);
    expect(svg).not.toMatch(/<\?xml|DOCTYPE|foreignObject|script|style|NaN|Infinity|auto/);
  });

  it("paints layers in Mind Elixir's stacking order", () => {
    const { doc } = render([
      box({ layer: "labels" }),
      box({ layer: "arrows" }),
      box({ layer: "nodes" }),
      box({ layer: "summaries" }),
      box({ layer: "branches" }),
    ]);
    const groups = elements(doc)
      .filter((e) => e.localName === "g")
      .map((g) => g.getAttribute("class"));
    expect(groups).toEqual([
      "mindmap-branches",
      "mindmap-nodes",
      "mindmap-summaries",
      "mindmap-arrows",
      "mindmap-labels",
    ]);
  });

  it("draws boxes as CSS does: the border inside, radii per corner", () => {
    const opaque = render([box({ border: { color: black, width: 2 } })]).doc.getElementsByTagName("rect")[0]!;
    expect(
      ["x", "y", "width", "height", "rx", "fill", "stroke", "stroke-width"].map((a) => opaque.getAttribute(a)),
    ).toEqual(["1", "1", "98", "38", "4", "#ff0000", "#000000", "2"]);

    // A translucent border shows the background under it: two shapes
    const translucent = render([
      box({
        fill: { hex: "#ff0000", alpha: 0.5 },
        border: { color: { hex: "#000000", alpha: 0.5 }, width: 2, dash: [6, 6], linecap: "round" },
      }),
    ]).doc;
    const rects = translucent.getElementsByTagName("rect");
    expect(rects.length).toBe(2);
    expect(rects[0]!.getAttribute("fill-opacity")).toBe("0.5");
    expect(
      ["fill", "stroke-opacity", "stroke-dasharray", "stroke-linecap"].map((a) => rects[1]!.getAttribute(a)),
    ).toEqual(["none", "0.5", "6 6", "round"]);

    const corners = render([box({ radii: [r(4), r0, r(4), { x: 8, y: 2 }] })]).doc;
    expect(corners.getElementsByTagName("path")[0]?.getAttribute("d")).toMatch(/^M4 0H100/);
    const elliptical = render([
      box({
        radii: [
          { x: 6, y: 3 },
          { x: 6, y: 3 },
          { x: 6, y: 3 },
          { x: 6, y: 3 },
        ],
      }),
    ]).doc.getElementsByTagName("rect")[0]!;
    expect([elliptical.getAttribute("rx"), elliptical.getAttribute("ry")]).toEqual(["6", "3"]);
    const square = render([box({ radii: [r0, r0, r0, r0] })]).doc.getElementsByTagName("rect")[0]!;
    expect(square.hasAttribute("rx")).toBe(false);

    // A translucent border alone, a border only, a translucent group, and nothing visible at all
    expect(
      render([
        box({ fill: undefined, border: { color: { hex: "#000000", alpha: 0.5 }, width: 2 } }),
      ]).doc.getElementsByTagName("rect").length,
    ).toBe(1);
    expect(
      render([box({ fill: undefined, border: { color: black, width: 1 } })])
        .doc.getElementsByTagName("rect")[0]!
        .getAttribute("fill"),
    ).toBe("none");
    expect(render([box({ opacity: 0.4 })]).svg).toContain('<g opacity="0.4"><rect');
    expect(
      render([box({ fill: { hex: "#fff", alpha: 0 }, border: { color: black, width: 0 } }), box({ layer: "labels" })])
        .svg,
    ).not.toContain("mindmap-nodes");
  });

  it("copies paths with their transform and stroke", () => {
    const path: PathShape = {
      kind: "path",
      layer: "arrows",
      d: "M0 0 L10 10",
      transform: [1, 0, 0, 1, 5, 5],
      stroke: { color: { hex: "#e37d74", alpha: 1 }, width: 2, dash: [8, 2], linejoin: "round" },
      opacity: 0.5,
      bounds: { x: 4, y: 4, width: 12, height: 12 },
    };
    const el = render([path]).doc.getElementsByTagName("path")[0]!;
    expect(
      ["d", "transform", "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linejoin", "opacity"].map((a) =>
        el.getAttribute(a),
      ),
    ).toEqual(["M0 0 L10 10", "translate(5 5)", "none", "#e37d74", "2", "8 2", "round", "0.5"]);
    const filled = render([{ ...path, stroke: undefined, fill: red, opacity: 1 }]).doc.getElementsByTagName("path")[0]!;
    expect([filled.getAttribute("fill"), filled.hasAttribute("stroke"), filled.hasAttribute("opacity")]).toEqual([
      "#ff0000",
      false,
      false,
    ]);
  });

  it("writes text as tspans that only override what differs", () => {
    const { doc } = render([
      text([
        run({ text: "Bold ", fontWeight: "700" }),
        run({ text: "plain", x: 50 }),
        run({
          text: "deco",
          y: 40,
          fontStyle: "italic",
          decoration: ["underline", "line-through"],
          letterSpacing: 1,
          fill: { hex: "#000000", alpha: 0.5 },
        }),
      ]),
    ]);
    const t = doc.getElementsByTagName("text")[0]!;
    expect(t.getAttribute("xml:space")).toBe("preserve");
    expect(t.getAttribute("font-weight")).toBe("700");
    const spans = [...t.getElementsByTagName("tspan")];
    expect(spans.map((s) => s.textContent)).toEqual(["Bold ", "plain", "deco"]);
    expect(spans[1]!.getAttribute("font-weight")).toBe("400");
    expect(
      ["x", "y", "font-style", "text-decoration", "letter-spacing", "fill-opacity"].map((a) =>
        spans[2]!.getAttribute(a),
      ),
    ).toEqual(["10", "40", "italic", "underline line-through", "1", "0.5"]);
    expect(spans[0]!.hasAttribute("font-weight")).toBe(false);
  });

  it("writes measured widths as textLength when asked", () => {
    const { doc } = render(
      [
        text([
          run({ text: "fit", width: 33.333 }),
          run({ text: "empty", width: 0 }),
          run({ text: "rtl", direction: "rtl", width: 20 }),
        ]),
      ],
      { textLength: true },
    );
    const [fit, empty] = [...doc.getElementsByTagName("tspan")];
    expect([fit!.getAttribute("textLength"), fit!.getAttribute("lengthAdjust")]).toEqual(["33.33", "spacing"]);
    expect(empty!.hasAttribute("textLength")).toBe(false);
    expect(doc.getElementsByTagName("text")[1]!.getAttribute("textLength")).toBe("20");
  });

  it("anchors right-to-left runs at their right edge", () => {
    const { doc } = render([text([run({ text: "שלום עולם", x: 90, direction: "rtl" }), run({ text: "ltr" })])]);
    const texts = doc.getElementsByTagName("text");
    expect(texts.length).toBe(2);
    expect(["x", "direction", "text-anchor"].map((a) => texts[1]!.getAttribute(a))).toEqual(["90", "rtl", "start"]);
    expect(texts[1]!.textContent).toBe("שלום עולם");
    const only = render([text([run({ text: "مرحبا", direction: "rtl" })])]).doc.getElementsByTagName("text");
    expect(only.length).toBe(1);
  });

  it("wraps linked text in <a> and keeps hostile text as text", () => {
    const hostile = '</text><script>alert(1)</script><foreignObject/>$$&"';
    const { doc } = render([text([run({ text: hostile })], { href: "https://example.com/?a=1&b=2", opacity: 0.5 })]);
    const a = doc.getElementsByTagName("a")[0]!;
    expect(a.getAttribute("href")).toBe("https://example.com/?a=1&b=2");
    expect(doc.getElementsByTagName("tspan")[0]?.textContent).toBe(hostile);
    const names = new Set(elements(doc).map((e) => e.localName));
    expect([...names].sort()).toEqual(["a", "g", "svg", "text", "title", "tspan"]);
  });

  it("embeds images with their fit and rounded corners as clip paths", () => {
    const image = (overrides: Partial<ImageShape> = {}): ImageShape => ({
      kind: "image",
      layer: "nodes",
      box: { x: 0, y: 0, width: 40, height: 30 },
      href: "data:image/png;base64,AAAA",
      fit: "slice",
      opacity: 1,
      ...overrides,
    });
    const { doc } = render(
      [
        image({ radii: [r(4), r(4), r(4), r(4)] }),
        image({ fit: "none", radii: [r0, r0, r0, r0], opacity: 0.3 }),
        image({ fit: "meet", radii: [r(2), r(2), r(2), r(2)] }),
      ],
      { idPrefix: "x" },
    );
    const images = doc.getElementsByTagName("image");
    expect(images[0]!.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
    expect(images[0]!.getAttribute("clip-path")).toBe("url(#x-clip-1)");
    expect(images[1]!.getAttribute("preserveAspectRatio")).toBe("none");
    expect(images[1]!.hasAttribute("clip-path")).toBe(false);
    expect(images[1]!.getAttribute("opacity")).toBe("0.3");
    expect(images[2]!.getAttribute("clip-path")).toBe("url(#x-clip-2)");
    // Every id is unique and every reference resolves
    const ids = elements(doc)
      .map((e) => e.getAttribute("id"))
      .filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    for (const img of [...images]) {
      const ref = /^url\(#(.+)\)$/.exec(img.getAttribute("clip-path") ?? "")?.[1];
      if (ref) expect(ids).toContain(ref);
    }
  });

  it("refuses empty or invalid geometry and oversized output", () => {
    expect(() => renderDocument([], options())).toThrow(expect.objectContaining({ code: "INVALID_GEOMETRY" }));
    expect(() => renderDocument([box({ box: { x: 0, y: 0, width: 0, height: 0 } })], options())).toThrow(
      expect.objectContaining({ code: "INVALID_GEOMETRY" }),
    );
    expect(() => renderDocument([box({ box: { x: Number.NaN, y: 0, width: 1, height: 1 } })], options())).toThrow(
      expect.objectContaining({ code: "INVALID_GEOMETRY" }),
    );
    expect(() => renderDocument([box()], options({ maxOutputLength: 100 }))).toThrow(
      expect.objectContaining({ code: "LIMIT_EXCEEDED" }),
    );
  });
});
