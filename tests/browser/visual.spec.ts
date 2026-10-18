import { expect, test, type Page, type TestInfo } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { FixtureName } from "../fixtures.js";
import { openMap, renderInNode } from "./support.js";

/**
 * The SVG the renderer makes from the data alone (in Node), drawn on its own as an <img>, against
 * the editor showing the same map in Arial, pixel by pixel.
 *
 * HTML text is hinted and snapped to the pixel grid; SVG text is drawn at its exact position, so
 * glyph edges always differ. Text is masked out (its position is checked by layout.spec.ts) and
 * everything else compared: boxes, borders, branch lines, arrows, summaries, icons and images.
 */
const MAX_DIFFERENT = 0.005;
// The whole image, text included, as a backstop against gross differences
const MAX_DIFFERENT_RAW = 0.05;
// Approximate layouts (emoji, CJK; Firefox's taller lines) put topics a few pixels apart: at
// most 9.7% of the pixels differed (Firefox, wide). A backstop against what is plainly wrong
const MAX_DIFFERENT_APPROXIMATE = 0.12;

type Rect = { x: number; y: number; width: number; height: number };

/** Paints the same areas of both images one colour, so they are not compared. */
function mask(images: PNG[], rects: Rect[], ratio: number) {
  for (const png of images) {
    for (const r of rects) {
      const x0 = Math.max(0, Math.floor(r.x * ratio));
      const y0 = Math.max(0, Math.floor(r.y * ratio));
      const x1 = Math.min(png.width, Math.ceil((r.x + r.width) * ratio));
      const y1 = Math.min(png.height, Math.ceil((r.y + r.height) * ratio));
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) png.data.set([255, 0, 255, 255], (y * png.width + x) * 4);
    }
  }
}

async function compare(page: Page, fixture: FixtureName, testInfo: TestInfo) {
  // The whole map must be on screen: a large editor in a viewport of the same size
  // The whole map must be on screen. Mind Elixir centres the root, and `deep` reaches 3,300 px
  // to its right
  await openMap(page, fixture, { width: fixture === "deep" ? 7200 : 2400, height: 1600 });
  // A little padding keeps content off the image edges
  // The SVG made in Node, from the data alone; the editor is only the reference
  const result = await renderInNode(fixture, { padding: 4 });
  const [vx, vy] = result.viewBox.split(" ").map(Number) as [number, number];
  const origin = await page.evaluate(() => {
    const r = (window as any).__mind.nodes.getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
  // Screenshots are taken on whole pixels: the SVG is placed at the same sub-pixel offset
  const left = origin.x + vx;
  const top = origin.y + vy;
  const clip = {
    x: Math.floor(left),
    y: Math.floor(top),
    width: Math.ceil(left + result.width) - Math.floor(left),
    height: Math.ceil(top + result.height) - Math.floor(top),
  };
  expect(clip.x).toBeGreaterThanOrEqual(0);
  expect(clip.y).toBeGreaterThanOrEqual(0);
  const editor = PNG.sync.read(await page.screenshot({ clip }));
  // Text drawn by the editor, in clip coordinates, one pixel larger on every side
  const textRects: Rect[] = await page.evaluate((clip) => {
    const nodes = (window as any).__mind.nodes as HTMLElement;
    const walker = document.createTreeWalker(nodes, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const out = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      range.selectNodeContents(n);
      for (const r of range.getClientRects())
        out.push({ x: r.left - clip.x - 1, y: r.top - clip.y - 1, width: r.width + 2, height: r.height + 2 });
    }
    return out;
  }, clip);

  const view = await page.context().newPage();
  await view.setViewportSize({ width: clip.width + 10, height: clip.height + 10 });
  const src = `data:image/svg+xml;base64,${Buffer.from(result.svg).toString("base64")}`;
  await view.setContent(
    `<body style="margin:0"><img id="svg" src="${src}" width="${result.width}" height="${result.height}" ` +
      // A transform, unlike left/top, is not snapped to whole pixels
      `style="position:absolute;left:0;top:0;transform:translate(${left - clip.x}px,${top - clip.y}px)"></body>`,
  );
  await view.locator("#svg").evaluate((img: HTMLImageElement) => img.decode());
  const exported = PNG.sync.read(
    await view.screenshot({ clip: { x: 0, y: 0, width: clip.width, height: clip.height } }),
  );
  await view.close();
  expect([exported.width, exported.height]).toEqual([editor.width, editor.height]);

  const { width, height } = editor;
  const diff = new PNG({ width, height });
  const raw = pixelmatch(editor.data, exported.data, diff.data, width, height, { threshold: 0.1 }) / (width * height);
  const images: Record<string, PNG> = {
    editor: PNG.sync.read(PNG.sync.write(editor)),
    svg: PNG.sync.read(PNG.sync.write(exported)),
    diff,
  };
  mask([editor, exported], textRects, width / clip.width);
  const shapesDiff = new PNG({ width, height });
  const shapes =
    pixelmatch(editor.data, exported.data, shapesDiff.data, width, height, { threshold: 0.1 }) / (width * height);
  images["shapes-diff"] = shapesDiff;

  for (const [kind, png] of Object.entries(images)) {
    await testInfo.attach(`${fixture}-${kind}.png`, { body: PNG.sync.write(png), contentType: "image/png" });
    if (process.env.VISUAL_OUT) {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      mkdirSync(process.env.VISUAL_OUT, { recursive: true });
      writeFileSync(`${process.env.VISUAL_OUT}/${testInfo.project.name}-${fixture}-${kind}.png`, PNG.sync.write(png));
    }
  }
  const report = `${fixture}: shapes ${(shapes * 100).toFixed(3)}%, whole image ${(raw * 100).toFixed(3)}% of ${width}×${height}`;
  testInfo.annotations.push({ type: "pixel difference", description: report });
  console.log(`[visual] ${testInfo.project.name} ${report}`);
  return { shapes, raw };
}

// Maps in Arial must look like the editor; with emoji and CJK, the layout is an approximation
// (see layout.spec.ts) and only the backstop applies
const EXACT: FixtureName[] = ["three", "topDown", "wide", "deep"];
const APPROXIMATE: FixtureName[] = ["rich", "features", "unicode"];

for (const fixture of [...EXACT, ...APPROXIMATE]) {
  test(`${fixture} looks like the editor`, async ({ page, browserName }, testInfo) => {
    const { shapes, raw } = await compare(page, fixture, testInfo);
    // Firefox's taller lines move every topic below the first (layout.spec.ts)
    const exact = EXACT.includes(fixture) && browserName !== "firefox";
    if (exact) expect(shapes).toBeLessThan(MAX_DIFFERENT);
    expect(raw).toBeLessThan(exact ? MAX_DIFFERENT_RAW : MAX_DIFFERENT_APPROXIMATE);
  });
}
