import { expect, test } from "@playwright/test";
import { assertValidSvg, expectTopicBoxesMatch, exportMap, openMap, svgLines } from "./support.js";
import type { SvgExportResult } from "../../src/index.js";

/**
 * The editor's zoom and pan, and the device pixel ratio, must not change what is exported
 * (the failure pattern of eXeLearning #2490: geometry measured at one scale saved for everyone).
 */

const numbers = (svg: string) => [...svg.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

function maxDifference(a: SvgExportResult, b: SvgExportResult): number {
  const x = numbers(a.svg);
  const y = numbers(b.svg);
  expect(y.length).toBe(x.length);
  return Math.max(...x.map((v, i) => Math.abs(v - (y[i] as number))));
}

test("editor zoom and pan do not change the exported geometry", async ({ page }) => {
  await openMap(page, "rich", { scaleMax: 2.5 });
  const reference = await exportMap(page);
  for (const scale of [0.9, 0.984375, 1.25, 1.5, 1.75, 2]) {
    await page.evaluate((s) => {
      const mind = (window as any).__mind;
      mind.scale(s);
      mind.move(37, -21);
    }, scale);
    expect(await page.evaluate(() => (window as any).__mind.scaleVal)).toBeCloseTo(scale, 6);
    const result = await exportMap(page);
    assertValidSvg(result);
    expect(svgLines(result)).toEqual(svgLines(reference));
    // Coordinates are written with two decimals; dividing by a fractional scale can move the
    // last one, and a width (two rounded edges) by up to 0.02
    expect(maxDifference(result, reference), `scale ${scale}`).toBeLessThanOrEqual(0.025);
    await expectTopicBoxesMatch(page, result);
  }
});

for (const deviceScaleFactor of [1.25, 1.75, 0.984375]) {
  test(`device scale factor ${deviceScaleFactor} keeps every label whole and in place`, async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName === "firefox" && deviceScaleFactor < 1, "Firefox does not emulate scale factors below 1");
    const reference = await (async () => {
      const context = await browser.newContext({ deviceScaleFactor: 1 });
      const page = await context.newPage();
      await openMap(page, "rich");
      const result = await exportMap(page);
      await context.close();
      return result;
    })();
    const context = await browser.newContext({ deviceScaleFactor });
    const page = await context.newPage();
    await openMap(page, "rich");
    expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(deviceScaleFactor, 5);
    const result = await exportMap(page);
    assertValidSvg(result);
    // Same lines: no label is wrapped differently or cut
    expect(svgLines(result)).toEqual(svgLines(reference));
    // The SVG is what this page's editor shows
    await expectTopicBoxesMatch(page, result);
    // Chromium and Firefox lay text out the same at any pixel ratio (within a pixel). WebKit's
    // own layout changes with it (text advances shift by 1-2 px per node), so there the test
    // is only that the export follows the editor
    if (browserName !== "webkit") expect(maxDifference(result, reference)).toBeLessThanOrEqual(1);
    await context.close();
  });
}
