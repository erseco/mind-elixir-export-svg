import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DARK_THEME,
  createSvgExportPlugin,
  downloadSvg,
  exportSvg,
  renderSvg,
  toDataUrl,
  type SvgExportOptions,
  type SvgExportResult,
  type WithVectorSvgExport,
} from "../../src/index.js";
import { FIXTURES, PNG_DATA_URL, visibleTopics, type FixtureName } from "../fixtures.js";
import { elements, parseSvg } from "./helpers.js";

const render = (name: FixtureName, options: SvgExportOptions = {}) => {
  const f = FIXTURES[name];
  return renderSvg({ ...(f.data as { nodeData: object }), direction: f.direction ?? 2 }, options);
};
const PNG = PNG_DATA_URL.split(",")[1]!;
const SVG_AS_PNG = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString("base64")}`;
const ALLOWED = new Set([
  "svg",
  "title",
  "desc",
  "defs",
  "clipPath",
  "g",
  "rect",
  "path",
  "text",
  "tspan",
  "image",
  "a",
]);

function check(result: SvgExportResult) {
  const doc = parseSvg(result.svg);
  const all = elements(doc);
  for (const el of all) {
    expect(ALLOWED).toContain(el.localName);
    for (const attr of [...el.attributes]) {
      expect(attr.name.startsWith("on")).toBe(false);
      expect(attr.value).not.toMatch(/NaN|Infinity|undefined/);
      if (attr.name === "href")
        expect(attr.value).toMatch(
          el.localName === "image" ? /^data:image\/(png|jpeg|gif|webp|avif);base64,/ : /^(https?|mailto):/,
        );
    }
  }
  expect([result.width, result.height].every((v) => Number.isFinite(v) && v > 0)).toBe(true);
  return doc;
}
const textOf = (result: SvgExportResult) =>
  elements(parseSvg(result.svg))
    .filter((e) => e.localName === "tspan" || (e.localName === "text" && !e.getElementsByTagName("tspan").length))
    .map((e) => e.textContent ?? "");
const norm = (s: string) => s.replace(/\s+/g, "");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("renderSvg", () => {
  for (const name of Object.keys(FIXTURES) as FixtureName[]) {
    it(`${name}: a valid, deterministic SVG with every visible topic`, async () => {
      const result = await render(name);
      check(result);
      const text = norm(textOf(result).join(""));
      for (const topic of visibleTopics(FIXTURES[name])) expect(text).toContain(norm(topic));
      expect((await render(name)).svg).toBe(result.svg);
    });
  }

  it("needs no DOM and draws native shapes and text only", async () => {
    expect(typeof document).toBe("undefined");
    const result = await render("features");
    const doc = check(result);
    expect(doc.getElementsByTagName("image").length).toBe(1);
    expect(result.svg).not.toMatch(/foreignObject|<style|<script/);
    // Arrows (line + heads, the second bidirectional), summary, branches, the folded node's icon
    const group = (cls: string) => [...doc.getElementsByTagName("g")].find((g) => g.getAttribute("class") === cls);
    expect(group("mindmap-arrows")?.getElementsByTagName("path").length).toBe(5);
    expect(group("mindmap-summaries")?.getElementsByTagName("path").length).toBe(1);
    expect(group("mindmap-branches")?.getElementsByTagName("path").length).toBe(5);
    expect(
      [...doc.getElementsByTagName("path")].filter((p) => /^matrix\(0\.01/.test(p.getAttribute("transform") ?? ""))
        .length,
    ).toBe(2);
    expect(textOf(result)).toEqual(
      expect.arrayContaining(["relates to", "both ways", "summary text", "tag1", "tag2", "🔗"]),
    );
    expect(doc.getElementsByTagName("a")[0]?.getAttribute("href")).toBe("https://example.com/page?a=1&b=2");
    expect(doc.getElementsByTagName("title")[0]?.textContent).toBe("Root & <b>");
    expect(doc.getElementsByTagName("tspan")[0]?.getAttribute("textLength")).toMatch(/^\d/);
  });

  it("takes an instance (getData, theme, direction) as well as data", async () => {
    const f = FIXTURES.three;
    const instance = { getData: () => structuredClone(f.data) as never, theme: DARK_THEME, direction: 1 };
    const fromInstance = await renderSvg(instance);
    const fromData = await renderSvg({ ...(f.data as { nodeData: object }), theme: DARK_THEME, direction: 1 });
    expect(fromInstance.svg).toBe(fromData.svg);
    expect(fromInstance.svg).toContain(`fill="#252526"`);
  });

  it("keeps hostile text as text", async () => {
    const result = await render("hostile");
    const doc = check(result);
    const texts = textOf(result);
    for (const t of [
      "</text><script>alert(1)</script>",
      "<foreignObject>unexpected</foreignObject>",
      '<img src=x onerror="alert(1)">',
      "$$x=\\frac{a}{b}$$ $& $' back\\slash",
    ]) {
      expect(texts).toContain(t);
    }
    expect(new Set(elements(doc).map((e) => e.localName)).has("script")).toBe(false);
    expect(result.warnings).toEqual([expect.objectContaining({ code: "UNSAFE_LINK" })]);
  });

  it("follows the options", async () => {
    const t = await render("three", {
      background: "transparent",
      padding: 0,
      title: "Título",
      description: "Un mapa",
      idPrefix: "m1",
      textLength: false,
      links: "text",
      fontFamily: "Inter, sans-serif",
    });
    const doc = check(t);
    expect(doc.getElementsByTagName("rect")[0]?.getAttribute("fill")).not.toBe("#f6f6f6");
    expect(doc.getElementsByTagName("title")[0]?.getAttribute("id")).toBe("m1-title");
    expect(doc.getElementsByTagName("desc")[0]?.textContent).toBe("Un mapa");
    expect(t.svg).not.toContain("textLength");
    expect(t.svg).toContain('font-family="Inter, sans-serif"');
    expect((await render("three", { background: "#123456" })).svg).toContain('fill="#123456"');
    expect((await render("features", { links: "text" })).svg).not.toContain("<a ");
    expect((await render("three", { direction: 3 })).height).toBeGreaterThan((await render("three")).height);
    // A transparent theme background is not replaced with the light canvas colour
    const clear = await renderSvg(
      { nodeData: { topic: "T" } },
      { theme: { palette: ["#000"], cssVar: { "--bgcolor": "transparent" } } },
    );
    expect(clear.svg).not.toContain("#f6f6f6");
    // A partial dark theme takes the dark base, not the light one
    const dark = await renderSvg({ nodeData: { topic: "T" } }, { theme: { type: "dark", palette: ["#010101"] } });
    expect(dark.svg).toContain('fill="#252526"');
    expect(dark.svg).toContain('fill="#ffffff"');
    const roomy = await renderSvg({ nodeData: { topic: "T", children: [{ topic: "C" }] } });
    const tight = await renderSvg({ nodeData: { topic: "T", children: [{ topic: "C" }] }, compact: true });
    expect(tight.width).toBeLessThan(roomy.width);
  });

  it("lays out with another measurer", async () => {
    const mono = {
      width: (text: string, font: { size: number }) => [...text].length * font.size * 0.6,
      vertical: { ascent: 0.8, descent: 0.2, lineGap: 0, xHeight: 0.5 },
    };
    const a = await render("three", { measureText: mono });
    expect(a.svg).not.toBe((await render("three")).svg);
    check(a);
  });

  it("warns about custom HTML and styles it cannot draw, and refuses them in strict mode", async () => {
    const data = {
      nodeData: {
        id: "r",
        topic: "R",
        children: [
          { id: "h", topic: "", dangerouslySetInnerHTML: "<b>x</b>" },
          { id: "s", topic: "S", style: { color: "var(--x)", background: "linear-gradient(red, blue)" } },
        ],
      },
    };
    const result = await renderSvg(data);
    expect(result.warnings.map((w) => [w.code, w.nodeId])).toEqual([
      ["UNSUPPORTED_HTML", "h"],
      ["UNSUPPORTED_STYLE", "s"],
      ["UNSUPPORTED_STYLE", "s"],
    ]);
    await expect(renderSvg(data, { strict: true })).rejects.toMatchObject({ code: "UNSUPPORTED_HTML" });
  });

  it("skips arrows and summaries whose nodes are folded or missing", async () => {
    const data = {
      nodeData: {
        id: "r",
        topic: "R",
        children: [
          { id: "a", topic: "A", children: [{ id: "a1", topic: "a1" }] },
          {
            id: "b",
            topic: "B",
            expanded: false,
            children: [
              { id: "b1", topic: "b1" },
              { id: "b2", topic: "b2" },
            ],
          },
        ],
      },
      arrows: [
        { id: "ok", label: "", from: "a", to: "a1" },
        { id: "folded", label: "x", from: "a", to: "b1" },
        { id: "missing", label: "y", from: "a", to: "zz" },
      ],
      summaries: [
        { id: "s1", label: "", parent: "a", start: 0, end: 0 },
        { id: "s2", label: "folded", parent: "b", start: 0, end: 1 },
        { id: "s3", label: "range", parent: "a", start: 0, end: 4 },
        { id: "s4", label: "missing", parent: "zz", start: 0, end: 0 },
        { id: "s5", label: "mains", parent: "r", start: 0, end: 1 },
      ],
    };
    const result = await renderSvg(data, { direction: 1 });
    const doc = check(result);
    const group = (cls: string) => [...doc.getElementsByTagName("g")].find((g) => g.getAttribute("class") === cls);
    // One arrow (line and head), two brackets (a's child, and the main nodes)
    expect(group("mindmap-arrows")?.getElementsByTagName("path").length).toBe(2);
    expect(group("mindmap-summaries")?.getElementsByTagName("path").length).toBe(2);
    expect(textOf(result)).toContain("mains");
    expect(textOf(result)).not.toContain("folded");
    // Empty labels draw nothing
    expect(group("mindmap-labels")?.getElementsByTagName("text").length).toBe(1);
  });

  it("draws the expand icon of folded nodes on every side", async () => {
    for (const direction of [0, 1, 3] as const) {
      const doc = check(
        await renderSvg(
          {
            nodeData: {
              topic: "R",
              children: [
                { topic: "M", expanded: false, children: [{ topic: "x" }] },
                { topic: "N", children: [{ topic: "S", expanded: false, children: [{ topic: "y" }] }] },
              ],
            },
          },
          { direction },
        ),
      );
      expect(
        [...doc.getElementsByTagName("path")].filter((p) => /^matrix\(0\.01/.test(p.getAttribute("transform") ?? ""))
          .length,
      ).toBe(4);
    }
  });

  it("enforces limits and can be cancelled", async () => {
    await expect(render("large", { limits: { maxNodes: 100 } })).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    await expect(render("large", { limits: { maxOutputLength: 1000 } })).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
    });
    const controller = new AbortController();
    controller.abort();
    await expect(render("three", { signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
    await expect(renderSvg({} as never)).rejects.toMatchObject({ code: "INVALID_DATA" });
  });
});

describe("edge cases", () => {
  it("falls back to black when the theme's colours cannot be used, and to the defaults", async () => {
    const theme = { palette: ["nope"], cssVar: { "--color": "nope", "--main-color": "nope" } };
    const data = {
      nodeData: {
        id: "r",
        topic: "",
        children: [
          {
            id: "m",
            topic: "M",
            branchColor: "nope",
            tags: [{ text: "t", style: { background: "nope", color: "nope" } }],
            children: [{ id: "c", topic: "C" }],
          },
        ],
      },
      summaries: [{ id: "s", label: "S", parent: "m", start: 0, end: 0 }],
    };
    const result = await renderSvg(data, { theme });
    const doc = check(result);
    expect(doc.getElementsByTagName("title")[0]?.textContent).toBe("Mind map");
    expect(result.svg).toContain('stroke="#000000"');
    // Unusable tag colours use Mind Elixir's own
    expect(result.svg).toContain('fill="#d6f0f8"');
    expect(result.svg).toContain('fill="#276f86"');
  });

  it("styles summaries and arrows as their data says, on either side", async () => {
    const data = {
      nodeData: {
        id: "r",
        topic: "R",
        children: [
          {
            id: "a",
            topic: "A",
            children: [
              { id: "a1", topic: "a1" },
              { id: "a2", topic: "a2" },
            ],
          },
          { id: "b", topic: "B" },
        ],
      },
      summaries: [
        { id: "s", label: "left", parent: "a", start: 0, end: 1, style: { stroke: "#00ff00", labelColor: "#0000ff" } },
      ],
      arrows: [
        {
          id: "x",
          label: "from root",
          from: "r",
          to: "a2",
          style: {
            stroke: "#ff00ff",
            strokeWidth: 4,
            strokeDasharray: "bad,dash",
            opacity: 0.5,
            labelColor: "#00ffff",
          },
        },
        { id: "y", label: "", from: "a1", to: "b", delta1: { x: 10, y: 0 }, delta2: { x: -10, y: 0 } },
      ],
    };
    const result = await renderSvg(data, { direction: 0 });
    check(result);
    for (const colour of ["#00ff00", "#0000ff", "#ff00ff", "#00ffff"]) expect(result.svg).toContain(colour);
    expect(result.svg).not.toContain("NaN");
    // An invalid dash pattern draws a solid line
    const arrow = parseSvg(result.svg).getElementsByTagName("path");
    expect([...arrow].some((p) => p.getAttribute("stroke") === "#ff00ff" && !p.hasAttribute("stroke-dasharray"))).toBe(
      true,
    );
  });

  it("fits images as their data says", async () => {
    for (const [fit, ratio] of [
      ["cover", "xMidYMid slice"],
      ["fill", "none"],
      [undefined, "xMidYMid slice"],
    ] as const) {
      const svg = (
        await renderSvg({
          nodeData: { topic: "R", image: { url: PNG_DATA_URL, width: 10, height: 10, ...(fit ? { fit } : {}) } },
        })
      ).svg;
      expect(svg).toContain(`preserveAspectRatio="${ratio}"`);
    }
  });

  it("wraps icons and tags that do not fit, and keeps the first of duplicate ids", async () => {
    const long = "palabra ".repeat(20);
    const data = {
      nodeData: {
        id: "r",
        topic: "R",
        children: [
          { id: "d", topic: long, icons: ["😀"], tags: Array.from({ length: 30 }, (_, i) => `tag ${i}`) },
          { id: "d", topic: "duplicate" },
        ],
      },
      arrows: [{ id: "a", label: "", from: "d", to: "r" }],
    };
    const result = await renderSvg(data);
    check(result);
    const tags = [...parseSvg(result.svg).getElementsByTagName("tspan")].filter((t) =>
      /^tag /.test(t.textContent ?? ""),
    );
    expect(new Set(tags.map((t) => t.getAttribute("y"))).size).toBeGreaterThan(1);
  });
});

describe("images", () => {
  const withImage = (url: string) => ({
    nodeData: {
      id: "r",
      topic: "R",
      children: [{ id: "i", topic: "Pic", image: { url, width: 40, height: 30, fit: "contain" } }],
    },
  });

  it("embeds data: images after checking their bytes, and never fetches", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const ok = await renderSvg(withImage(PNG_DATA_URL));
    expect(ok.svg).toContain(`href="data:image/png;base64,${PNG}"`);
    expect(ok.svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect((await renderSvg(withImage(SVG_AS_PNG))).warnings[0]?.message).toMatch(/not PNG, JPEG, GIF, WebP or AVIF/);
    expect((await renderSvg(withImage("data:image/png,raw"))).warnings[0]?.message).toMatch(/not base64/);
    expect((await renderSvg(withImage("https://x.test/a.png"))).warnings[0]?.message).toMatch(/no resolveImage/);
    expect((await renderSvg(withImage(PNG_DATA_URL), { embedImages: false })).warnings[0]?.message).toMatch(
      /embedImages: false/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks the resolver for other URLs and checks what it returns", async () => {
    const bytes = Buffer.from(PNG, "base64");
    const run = async (resolveImage: NonNullable<SvgExportOptions["resolveImage"]>) =>
      (await renderSvg(withImage("asset://pic"), { resolveImage })).warnings[0]?.message ?? "embedded";
    expect(await run(() => new Blob([bytes]))).toBe("embedded");
    expect(await run(async () => PNG_DATA_URL)).toBe("embedded");
    expect(await run(() => null)).toMatch(/returned nothing/);
    expect(await run(() => "not a url")).toMatch(/Blob or a base64 data: URL/);
    expect(await run(() => ({}) as never)).toMatch(/Blob or a base64 data: URL/);
    expect(await run(() => SVG_AS_PNG)).toMatch(/not PNG/);
    expect(await run(() => new Blob([new Uint8Array(6 * 1024 * 1024)]))).toMatch(/larger than/);
    expect(
      await run(() => {
        throw new Error("offline");
      }),
    ).toMatch(/resolveImage failed \(offline\)/);
    // The resolver gets the signal, and a cancelled export stops
    const controller = new AbortController();
    const seen: unknown[] = [];
    await expect(
      renderSvg(withImage("asset://pic"), {
        signal: controller.signal,
        resolveImage: (_url, { signal }) => {
          seen.push(signal);
          controller.abort();
          throw new Error("aborted");
        },
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(seen).toEqual([controller.signal]);
  });

  it("reads blob: URLs locally", async () => {
    const bytes = Buffer.from(PNG, "base64");
    vi.stubGlobal("fetch", async (url: string) =>
      url === "blob:ok" ? new Response(bytes) : Promise.reject(new Error("revoked")),
    );
    expect((await renderSvg(withImage("blob:ok"))).svg).toContain(`base64,${PNG}`);
    expect((await renderSvg(withImage("blob:gone"))).warnings[0]?.message).toMatch(
      /blob: URL could not be read \(revoked\)/,
    );
    const signal = new AbortController().signal;
    expect((await renderSvg(withImage("blob:ok"), { signal })).svg).toContain(`base64,${PNG}`);
  });
});

describe("helpers", () => {
  it("exportSvg returns an SVG Blob of the same document", async () => {
    const f = FIXTURES.three.data as { nodeData: object };
    const blob = await exportSvg(f);
    expect(blob.type).toBe("image/svg+xml;charset=utf-8");
    expect(await blob.text()).toBe((await renderSvg(f)).svg);
  });

  it("toDataUrl encodes the SVG's UTF-8 bytes as base64, past one chunk", async () => {
    const svg = (await render("rich")).svg + "<!--" + "ñ🌍".repeat(20000) + "-->";
    const url = toDataUrl(svg);
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(Buffer.from(url.split(",")[1]!, "base64").toString("utf8")).toBe(svg);
  });

  it("downloadSvg clicks a link to an object URL and revokes it", async () => {
    const clicked: string[] = [];
    const link = {
      href: "",
      download: "",
      style: { display: "" },
      click: () => clicked.push(`${link.href} ${link.download}`),
      remove: vi.fn(),
    };
    vi.stubGlobal("document", { createElement: () => link, body: { append: vi.fn() } });
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    vi.useFakeTimers();
    const result = await downloadSvg(FIXTURES.three.data as { nodeData: object }, 'mi "mapa"/1.svg');
    expect(clicked).toEqual([expect.stringMatching(/^blob:.* mi _mapa_1\.svg$/)]);
    expect(link.remove).toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith(link.href);
    vi.useRealTimers();
    expect(result.svg.startsWith("<svg")).toBe(true);
    await downloadSvg(FIXTURES.three.data as { nodeData: object }, "");
    expect(link.download).toBe("mindmap.svg");
  });

  it("the plugin adds exportVectorSvg with merged defaults, leaving exportSvg alone", async () => {
    const data = structuredClone(FIXTURES.three.data) as never;
    const exportSvgOriginal = () => "deprecated";
    const mind = { getData: () => data, exportSvg: exportSvgOriginal } as WithVectorSvgExport<{
      getData: () => never;
      exportSvg: () => string;
    }>;
    createSvgExportPlugin({ padding: 0, title: "Default", limits: { maxNodes: 50 } })(mind);
    const viaPlugin = await mind.exportVectorSvg({ title: "Override", limits: { maxImages: 1 } });
    expect(viaPlugin.svg).toBe((await renderSvg(data, { padding: 0, title: "Override" })).svg);
    await expect(mind.exportVectorSvg({ limits: { maxNodes: 1 } })).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
    expect(mind.exportSvg).toBe(exportSvgOriginal);
    await expect(mind.exportVectorSvg()).resolves.toMatchObject({ svg: expect.stringContaining("Default") });
  });
});
