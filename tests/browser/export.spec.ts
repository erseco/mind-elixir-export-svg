import { expect, test } from "@playwright/test";
import type { Element } from "@xmldom/xmldom";
import { FIXTURES, visibleTopics, type FixtureName } from "./fixtures.js";
import { assertValidSvg, editorState, exportMap, openMap, svgLines } from "./support.js";

const norm = (s: string) => s.replace(/\s+/g, "");

test.describe("every fixture", () => {
  for (const name of Object.keys(FIXTURES) as FixtureName[]) {
    test(`${name}: valid standalone SVG with every visible topic, and the editor untouched`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await openMap(page, name);
      const before = await editorState(page);
      const result = await exportMap(page);
      expect(await editorState(page)).toEqual(before);
      const doc = assertValidSvg(result);

      // Every visible topic is in the SVG as text (line breaks become separate lines)
      const text = norm(svgLines(result).join(""));
      for (const topic of visibleTopics(FIXTURES[name])) expect(text).toContain(norm(topic));
      // Folded branches are not drawn, so their children are not exported
      if (name === "features") expect(text).not.toContain("hidden");

      // Native text and vector shapes only: no raster except the map's own image
      const images = doc.getElementsByTagName("image");
      expect(images.length).toBe(name === "features" ? 1 : 0);
      if (name !== "hostile" && name !== "unicode") expect(result.warnings).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});

test("exports the whole map, not just what fits in the editor", async ({ page }) => {
  await openMap(page, "wide", { width: 400, height: 300 });
  const result = await exportMap(page, { padding: 0 });
  // Every topic, in layout coordinates, is inside the viewBox
  const boxes = await page.evaluate(() => {
    const nodes = (window as any).__mind.nodes as HTMLElement;
    const o = nodes.getBoundingClientRect();
    return [...nodes.querySelectorAll("me-tpc")].map((t) => {
      const r = t.getBoundingClientRect();
      return { x: r.left - o.left, y: r.top - o.top, right: r.right - o.left, bottom: r.bottom - o.top };
    });
  });
  const [vx, vy, vw, vh] = result.viewBox.split(" ").map(Number) as [number, number, number, number];
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(vx - 0.01);
    expect(b.y).toBeGreaterThanOrEqual(vy - 0.01);
    expect(b.right).toBeLessThanOrEqual(vx + vw + 0.01);
    expect(b.bottom).toBeLessThanOrEqual(vy + vh + 0.01);
  }
  expect(result.width).toBeGreaterThan(400);
  expect(norm(svgLines(result).join(""))).toContain(norm(`${"Palabra ".repeat(12)}5`));
});

test("exports arrows and summaries with their labels (Mind Elixir #359)", async ({ page }) => {
  await openMap(page, "features");
  const result = await exportMap(page);
  const doc = assertValidSvg(result);
  const labels = svgLines(result);
  expect(labels).toContain("relates to");
  expect(labels).toContain("both ways");
  expect(labels).toContain("summary text");
  const groups = (cls: string) => [...doc.getElementsByTagName("g")].find((g) => g.getAttribute("class") === cls);
  // Two arrows: dashed lines with heads (the bidirectional one has two), no transparent hit zones
  const arrows = [...(groups("mindmap-arrows")?.getElementsByTagName("path") ?? [])];
  expect(arrows.length).toBe(5);
  expect(arrows.every((p) => p.getAttribute("stroke") !== "none")).toBe(true);
  expect(
    arrows.filter((p) => p.getAttribute("stroke-dasharray")).map((p) => p.getAttribute("stroke-dasharray")),
  ).toEqual(["8 2", "4 4"]);
  expect(arrows.some((p) => p.getAttribute("stroke") === "#2e86de" && p.getAttribute("stroke-width") === "3")).toBe(
    true,
  );
  expect(groups("mindmap-summaries")?.getElementsByTagName("path").length).toBe(1);
  // Labels are painted above everything else
  expect(
    [...doc.documentElement!.getElementsByTagName("g")]
      .map((g) => g.getAttribute("class"))
      .filter(Boolean)
      .pop(),
  ).toBe("mindmap-labels");
});

test("exports tags, icons, the link and the collapsed-branch indicator", async ({ page }) => {
  await openMap(page, "features");
  const result = await exportMap(page);
  const doc = assertValidSvg(result);
  const lines = svgLines(result);
  for (const t of ["tag1", "tag2", "😀", "📌"]) expect(lines.join(" ")).toContain(t);
  const link = doc.getElementsByTagName("a")[0];
  expect(link?.getAttribute("href")).toBe("https://example.com/page?a=1&b=2");
  expect(link?.textContent).toContain("🔗");
  // The expand icon of the folded branch: a circle and a plus, scaled from 1024 units
  const icon = [...doc.getElementsByTagName("path")].filter((p) =>
    /^matrix\(0\.01/.test(p.getAttribute("transform") ?? ""),
  );
  expect(icon.length).toBe(2);
  expect(result.warnings).toEqual([]);
});

test("links can be exported as text only", async ({ page }) => {
  await openMap(page, "features");
  const result = await exportMap(page, { links: "text" });
  expect(assertValidSvg(result).getElementsByTagName("a").length).toBe(0);
  expect(svgLines(result).join("")).toContain("🔗");
});

test("top-down layout", async ({ page }) => {
  await openMap(page, "topDown");
  const result = await exportMap(page);
  assertValidSvg(result);
  // Children are below the root
  const ys = await page.evaluate(() => {
    const topics = [...(window as any).__mind.nodes.querySelectorAll("me-tpc")] as HTMLElement[];
    const y = (text: string) => topics.find((t) => t.textContent === text)!.getBoundingClientRect().top;
    return [y("Arriba"), y("Uno"), y("Dos"), y("Tres")];
  });
  expect(Math.min(...ys.slice(1))).toBeGreaterThan(ys[0]!);
  expect(result.height).toBeGreaterThan(result.width / 4);
});

test("uses explicit theme colours, light, dark and custom", async ({ page }) => {
  const colours: Record<string, string | null> = {};
  for (const theme of [undefined, "dark", "custom"] as const) {
    await openMap(page, "three", theme ? { theme } : {});
    const result = await exportMap(page);
    const doc = assertValidSvg(result);
    const bg = doc.getElementsByTagName("rect")[0]!;
    colours[theme ?? "light"] = bg.getAttribute("fill");
    // Text colours are written explicitly, so the page showing the SVG cannot change them
    for (const t of [...doc.getElementsByTagName("text")]) expect(t.getAttribute("fill")).toMatch(/^#[0-9a-f]{6}$/);
  }
  expect(new Set(Object.values(colours)).size).toBe(3);
  expect(colours.custom).toBe("#fdf6e3");
});

test("background option: transparent and a fixed colour", async ({ page }) => {
  await openMap(page, "three");
  const transparent = assertValidSvg(await exportMap(page, { background: "transparent" }));
  const firstRect = transparent.getElementsByTagName("rect")[0];
  expect(firstRect?.getAttribute("x")).not.toBe(transparent.documentElement!.getAttribute("viewBox")!.split(" ")[0]);
  const white = assertValidSvg(
    await exportMap(page, { background: "#ffffff", padding: 0, title: "Título", description: "Un mapa" }),
  );
  expect(white.getElementsByTagName("rect")[0]?.getAttribute("fill")).toBe("#ffffff");
  expect(white.getElementsByTagName("title")[0]?.textContent).toBe("Título");
  expect(white.getElementsByTagName("desc")[0]?.textContent).toBe("Un mapa");
});

test("the root topic is the default accessible name", async ({ page }) => {
  await openMap(page, "three");
  const doc = assertValidSvg(await exportMap(page));
  expect(doc.getElementsByTagName("title")[0]?.textContent).toBe("Mi primer mapa");
});

test("inline markdown keeps bold and italic as native text styles", async ({ page }) => {
  await openMap(
    page,
    {
      direction: 1,
      data: { nodeData: { id: "r", topic: "Root", children: [{ id: "m", topic: "plain **bold** and *italic*" }] } },
    },
    { markdown: true },
  );
  const result = await exportMap(page);
  const doc = assertValidSvg(result);
  const spans = [...doc.getElementsByTagName("tspan")];
  const span = (t: string) => spans.find((s) => s.textContent?.includes(t));
  // A tspan inherits what it does not override from its <text>
  const weight = (t: string) =>
    span(t)?.getAttribute("font-weight") ?? (span(t)?.parentNode as Element).getAttribute("font-weight") ?? "400";
  expect(spans.map((s) => s.textContent).join("")).toContain("plain bold and italic");
  expect(weight("bold")).toBe("700");
  expect(span("italic")?.getAttribute("font-style")).toBe("italic");
});

test("several maps on one page export independently with their own ids", async ({ page }) => {
  await openMap(page, "features", { count: 2, width: 900, height: 500 });
  const [a, b] = await page.evaluate(async () => {
    const { renderSvg } = (window as any).harness;
    const [m1, m2] = (window as any).__minds;
    return [await renderSvg(m1, { idPrefix: "first" }), await renderSvg(m2, { idPrefix: "second" })];
  });
  const ids = (svg: string) => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  expect(ids(a.svg).every((id) => id!.startsWith("first-"))).toBe(true);
  expect(ids(b.svg).every((id) => id!.startsWith("second-"))).toBe(true);
  expect(a.svg.replaceAll("first-", "")).toBe(b.svg.replaceAll("second-", ""));
});
