import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { SvgExportResult } from "../../src/index.js";
import { assertValidSvg, expectTopicBoxesMatch, exportMap, openMap, svgLines } from "./support.js";

/**
 * Native SVG text must sit where the editor drew it: the same lines, starting at the same x and
 * on the same baseline, and as wide. Checked against the editor itself, not against a model.
 */

// Lines made only of fallback glyphs (emoji) can be 1 px off in Firefox, whose box for them is
// taller than the primary font's (see docs/ARCHITECTURE.md, "Baselines")
const BASELINE_TOLERANCE: Record<string, number> = { chromium: 0.5, firefox: 1.5, webkit: 0.5 };

/**
 * The start and baseline of every line the editor drew. Lines and their starts come from the
 * untouched layout; the baseline of a text node's first line from a zero-size inline-block put
 * at its start (which sits on the baseline) and removed again, one at a time, so no probe can
 * change the layout another one measures. Later lines keep the first line's baseline offset.
 */
async function editorLines(page: Page) {
  return page.evaluate(() => {
    const nodes = (window as any).__mind.nodes as HTMLElement;
    const o = nodes.getBoundingClientRect();
    const texts: Text[] = [];
    const walker = document.createTreeWalker(nodes, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.trim()) texts.push(n as Text);
    const range = document.createRange();
    const measured = texts.map((node) => {
      const starts: { x: number; top: number; at: number }[] = [];
      for (let i = 0; i < node.data.length; i++) {
        if (/\s/.test(node.data[i]!)) continue;
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        const last = starts[starts.length - 1];
        const top = r.top - o.top;
        if (r.height && (!last || top > last.top + r.height / 2)) starts.push({ x: r.left - o.left, top, at: i });
      }
      return { node, starts };
    });
    const lines: { text: string; x: number; baseline: number }[] = [];
    for (const { node, starts } of measured) {
      const first = starts[0];
      if (!first) continue;
      // A custom element, so no stylesheet rule (".tags span"…) adds padding or margins to it
      const probe = document.createElement("x-baseline-probe");
      probe.style.cssText = "display:inline-block;width:0;height:0;margin:0;padding:0;border:0;vertical-align:baseline";
      node.before(probe);
      // The probe can move the line it is in (an extra inline box changes a tight line box), so
      // what is kept is its offset from the text measured with it in place
      range.setStart(node, first.at);
      range.setEnd(node, first.at + 1);
      const offset = probe.getBoundingClientRect().top - range.getBoundingClientRect().top;
      probe.remove();
      const baseline = first.top + offset;
      for (const s of starts)
        lines.push({ text: node.data.slice(s.at, s.at + 12), x: s.x, baseline: baseline + (s.top - first.top) });
    }
    return lines;
  });
}

function svgRuns(result: SvgExportResult) {
  const out: { x: number; y: number; text: string; rtl: boolean }[] = [];
  for (const m of result.svg.matchAll(/<(tspan|text)([^>]*)>([^<]*)(?=<)/g)) {
    const attrs = m[2]!;
    const x = /\bx="([^"]+)"/.exec(attrs)?.[1];
    const y = /\by="([^"]+)"/.exec(attrs)?.[1];
    if (x === undefined || y === undefined || !m[3]) continue;
    out.push({ x: Number(x), y: Number(y), text: m[3], rtl: / direction="rtl"/.test(attrs) });
  }
  return out;
}

for (const fixture of ["rich", "unicode", "features"] as const) {
  test(`${fixture}: every line starts where the editor drew it, on its baseline`, async ({ page, browserName }) => {
    await openMap(page, fixture);
    const result = await exportMap(page);
    const runs = svgRuns(result).filter((r) => !r.rtl);
    const lines = await editorLines(page);
    expect(lines.length).toBeGreaterThan(5);
    const tolerance = BASELINE_TOLERANCE[browserName]!;
    for (const line of lines) {
      // Right-to-left lines are positioned at their right edge; text.spec checks their extent
      if (/[֐-ࣿ]/.test(line.text)) continue;
      const run = runs.find((r) => Math.abs(r.x - line.x) < 0.5 && Math.abs(r.y - line.baseline) <= tolerance);
      const near = [...runs].sort(
        (a, b) => Math.hypot(a.x - line.x, a.y - line.baseline) - Math.hypot(b.x - line.x, b.y - line.baseline),
      )[0];
      expect(
        run,
        `line "${line.text}" at x ${line.x}, baseline ${line.baseline}; nearest run ${JSON.stringify(near)}`,
      ).toBeDefined();
    }
  });
}

test("drawn on its own, every run of text covers the same span as in the editor", async ({
  page,
  browser,
  browserName,
}) => {
  await openMap(page, "unicode");
  const result = await exportMap(page);
  // What the editor drew: the box of each text node's text
  const editor = await page.evaluate(() => {
    const nodes = (window as any).__mind.nodes as HTMLElement;
    const o = nodes.getBoundingClientRect();
    const walker = document.createTreeWalker(nodes, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const out: { text: string; left: number; right: number }[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n as Text).data.trim()) continue;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      out.push({ text: (n as Text).data, left: r.left - o.left, right: r.right - o.left });
    }
    return out;
  });
  // The SVG alone, in a page with nothing else: measure where each <text> draws
  const context = await browser.newContext();
  const view = await context.newPage();
  await view.setContent(`<body style="margin:0">${result.svg}</body>`);
  // Advance positions, as the editor's ranges measure them (a bounding box would include the
  // glyphs' side bearings, which differ by a pixel or two)
  const drawn = await view.evaluate(() =>
    [...document.querySelectorAll("text")].map((t) => {
      const text = t as SVGTextElement;
      const xs: number[] = [];
      for (let i = 0; i < text.getNumberOfChars(); i++)
        xs.push(text.getStartPositionOfChar(i).x, text.getEndPositionOfChar(i).x);
      const box = text.getBBox();
      return {
        text: t.textContent ?? "",
        left: Math.min(...xs),
        right: Math.max(...xs),
        boxLeft: box.x,
        boxRight: box.x + box.width,
      };
    }),
  );
  await context.close();
  // The SVG is drawn at 1× while the editor ran at the device's ratio (2× in WebKit, which then
  // rounds advances differently): textLength keeps each run at its measured width, within 1.5 px.
  for (const e of editor) {
    // WebKit reports the positions of joined, reordered Arabic and Hebrew glyphs a few pixels
    // apart from where the run is drawn (its width is fixed by textLength)
    const tolerance = browserName === "webkit" && /[\u0590-\u08ff]/.test(e.text) ? 3 : 1.5;
    const d = drawn.find((x) => x.text.trim() === e.text.trim());
    expect(d, `"${e.text}" is drawn`).toBeDefined();
    // WebKit's character positions are wrong for emoji sequences (it reports a 159.5 px run as
    // 155 px long while drawing it at 159.5 px), so its emoji lines are measured by their box
    const byBox = browserName === "webkit" && /\p{Extended_Pictographic}/u.test(e.text);
    const [left, right] = byBox ? [d!.boxLeft, d!.boxRight] : [d!.left, d!.right];
    // A box measures ink, so glyph side bearings add up to a few pixels
    const allowed = byBox ? 3 : tolerance;
    expect(Math.abs(left - e.left), `left of "${e.text}"`).toBeLessThanOrEqual(allowed);
    expect(Math.abs(right - e.right), `right of "${e.text}"`).toBeLessThanOrEqual(allowed);
  }
});

test("Unicode is kept intact: combining marks, ZWJ sequences, flags and bidi text", async ({ page }) => {
  await openMap(page, "unicode");
  const result = await exportMap(page);
  assertValidSvg(result);
  const lines = svgLines(result).join("\n");
  for (const s of [
    "é ñ ä",
    "👍🏽 👩‍👩‍👧 🇪🇸",
    "中文 日本語のテキスト 한국어",
    "שלום עולם",
    "مرحبا بالعالم",
    "∑∫√∞ ≤ ≥ © ™ € £ ¥",
  ]) {
    expect(lines).toContain(s);
  }
  // Nothing is split inside a grapheme: no lone surrogate or replacement character
  expect(result.svg).not.toMatch(/�|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
});

test("a long label keeps the editor's wrapping and is never cut", async ({ page }) => {
  const long = "Una etiqueta bastante larga que el editor tiene que repartir en varias líneas para que quepa";
  await openMap(page, "rich");
  const result = await exportMap(page);
  const editorLineCount = await page.evaluate((long) => {
    const t = [...(window as any).__mind.nodes.querySelectorAll("me-tpc")].find(
      (e: HTMLElement) => e.textContent === long,
    );
    const range = document.createRange();
    range.selectNodeContents(t.querySelector(".text"));
    return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
  }, long);
  expect(editorLineCount).toBeGreaterThan(1);
  const parts = svgLines(result).filter((l) => long.includes(l.trim()) && l.trim().length > 3);
  expect(parts.length).toBe(editorLineCount);
  expect(parts.join(" ").replace(/\s+/g, " ").trim()).toBe(long);
});

const INTER = readFileSync(
  new URL("../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2", import.meta.url),
);

/** Serves a web font from a fake origin after `delay` ms (or a 404), with no network. */
async function withWebFont(page: Page, delay: number, missing = false) {
  await page.route("https://fonts.test/**", async (route) => {
    await new Promise((r) => setTimeout(r, delay));
    if (missing) await route.fulfill({ status: 404, body: "" });
    else await route.fulfill({ status: 200, contentType: "font/woff2", body: INTER });
  });
  await openMap(page, "three");
  await page.addStyleTag({
    content: `@font-face { font-family: "InterTest"; src: url("https://fonts.test/inter.woff2") format("woff2"); }
      .map-container me-tpc { font-family: "InterTest", serif !important; }`,
  });
}

test.describe("web fonts", () => {
  test("waits for a font that is still loading, and measures with it", async ({ page }) => {
    await withWebFont(page, 600);
    expect(await page.evaluate(() => document.fonts.status)).toBe("loading");
    const result = await exportMap(page, { fontTimeout: 10_000 });
    expect(result.warnings).toEqual([]);
    expect(await page.evaluate(() => document.fonts.check('16px "InterTest"'))).toBe(true);
    expect(result.svg).toContain("InterTest");
    // The geometry is the editor's with the font loaded
    await expectTopicBoxesMatch(page, result);
  });

  test("warns when the font is still loading after the timeout, and strict mode refuses", async ({ page }) => {
    await withWebFont(page, 5000);
    const result = await exportMap(page, { fontTimeout: 100 });
    expect(result.warnings.map((w) => w.code)).toContain("FONT_UNAVAILABLE");
    const error = await page.evaluate(() =>
      (window as any).harness
        .renderSvg((window as any).__mind, { fontTimeout: 50, strict: true })
        .catch((e: any) => e.code),
    );
    expect(error).toBe("FONT_UNAVAILABLE");
  });

  test("warns about a font that failed to load", async ({ page }) => {
    await withWebFont(page, 0, true);
    await page.waitForFunction(() => document.fonts.status === "loaded");
    const result = await exportMap(page);
    expect(result.warnings.map((w) => w.code)).toContain("FONT_UNAVAILABLE");
    assertValidSvg(result);
  });
});
