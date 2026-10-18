import { expect, test, type Page, type TestInfo } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import type { FixtureName } from "./fixtures.js";
import { exportMap, openMap } from "./support.js";

/**
 * Renders the exported SVG on its own (as an <img>: no Mind Elixir, no stylesheet) and compares
 * it pixel by pixel with the editor showing the same map. Screenshots are only the test; the
 * export never uses them.
 *
 * HTML text is hinted and snapped to the pixel grid; SVG text is drawn at its exact position.
 * Glyphs land in the same place but their edges are rasterized differently, so text is masked
 * out here and its position checked geometrically in text.spec.ts. What is compared strictly is
 * everything else: boxes, borders, branch lines, arrows, summaries, icons and images.
 */
const MAX_DIFFERENT = 0.005;
// The whole image, text included, as a backstop against gross differences
const MAX_DIFFERENT_RAW = 0.05;

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
  await page.setViewportSize({ width: 2400, height: 1600 });
  await openMap(page, fixture, { width: 2400, height: 1600 });
  await page.addStyleTag({ content: ".mind-elixir-toolbar { display: none !important }" });
  // A little padding keeps content off the image edges
  const result = await exportMap(page, { padding: 4 });
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

for (const fixture of ["three", "rich", "features", "unicode", "topDown"] as const) {
  test(`${fixture} looks like the editor`, async ({ page }, testInfo) => {
    const { shapes, raw } = await compare(page, fixture, testInfo);
    expect(shapes).toBeLessThan(MAX_DIFFERENT);
    expect(raw).toBeLessThan(MAX_DIFFERENT_RAW);
  });
}
