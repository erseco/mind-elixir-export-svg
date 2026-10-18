import { expect, test } from "@playwright/test";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { openMap, renderInNode } from "./support.js";

/**
 * The SVG in other renderers: resvg (an independent renderer, as used by many server-side tools)
 * and svg2pdf.js (vector PDF). Each runs once, in Chromium's project.
 */

const PDF_HARNESS = readFileSync(new URL("./.harness/pdf-harness.js", import.meta.url), "utf8");

for (const fixture of ["three", "rich", "features", "unicode"] as const) {
  test(`${fixture}: resvg renders it at its own size`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "renderer-independent: once is enough");
    void page;
    const result = await renderInNode(fixture);
    const png = PNG.sync.read(new Resvg(result.svg, { font: { loadSystemFonts: true } }).render().asPng());
    // resvg rounds a fractional size to whole pixels
    expect(Math.abs(png.width - result.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(png.height - result.height)).toBeLessThanOrEqual(1);
    // Something is drawn besides the background: count pixels that differ from the corner
    const [r, g, b] = png.data;
    let drawn = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if (Math.abs(png.data[i]! - r!) + Math.abs(png.data[i + 1]! - g!) + Math.abs(png.data[i + 2]! - b!) > 30) drawn++;
    }
    expect(drawn / (png.width * png.height)).toBeGreaterThan(0.02);
  });
}

test("svg2pdf.js converts it to a vector PDF with text and paths", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "renderer-independent: once is enough");
  await openMap(page, "features");
  const result = await renderInNode("features");
  await page.addScriptTag({ content: PDF_HARNESS });
  const pdf = await page.evaluate(async ({ svg, width, height }) => {
    const { jsPDF } = (window as any).pdf;
    const doc = new jsPDF({
      unit: "px",
      format: [width, height],
      orientation: width > height ? "landscape" : "portrait",
      compress: false,
      hotfixes: ["px_scaling"],
    });
    const host = document.createElement("div");
    host.innerHTML = svg;
    await doc.svg(host.firstElementChild, { x: 0, y: 0, width, height });
    return doc.output();
  }, result);
  expect(pdf.startsWith("%PDF-")).toBe(true);
  // Text is text (BT … Tj/TJ … ET) and lines are paths (… c / l … S), not an embedded raster of the map
  expect(pdf).toMatch(/BT[\s\S]+?(Tj|TJ)[\s\S]+?ET/);
  expect(pdf).toMatch(/\bc\b[\s\S]*\bS\b/);
  for (const text of ["relates to", "summary text", "tag1"]) expect(pdf).toContain(text);
  // The only raster is the node's own 1×1 image (and its alpha mask), never the map
  const widths = [...pdf.matchAll(/\/Subtype \/Image[\s\S]*?\/Width (\d+)/g)].map((m) => Number(m[1]));
  expect(widths.length).toBeGreaterThan(0);
  expect(widths.every((w) => w === 1)).toBe(true);
});
