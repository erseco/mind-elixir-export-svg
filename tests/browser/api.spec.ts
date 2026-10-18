import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dataOf, openMap, renderInNode } from "./support.js";

/** The library in a browser: the same SVG as in Node, from an instance, a plugin, a download. */

test("gives the same SVG in the browser as in Node", async ({ page }) => {
  for (const name of ["features", "rich", "unicode"] as const) {
    await openMap(page, name);
    const inBrowser = await page.evaluate(
      (data) => (window as any).harness.renderSvg(data).then((r: any) => r.svg),
      dataOf(name),
    );
    expect(inBrowser).toBe((await renderInNode(name)).svg);
  }
});

test("renders a live instance from its data, theme and direction", async ({ page }) => {
  await openMap(page, "three");
  const out = await page.evaluate(async () => {
    const { renderSvg } = (window as any).harness;
    const mind = (window as any).__mind;
    const before = JSON.stringify(mind.getData());
    const fromInstance = (await renderSvg(mind)).svg;
    const fromData = (await renderSvg({ ...mind.getData(), theme: mind.theme, direction: mind.direction })).svg;
    return { same: fromInstance === fromData, unchanged: before === JSON.stringify(mind.getData()) };
  });
  expect(out).toEqual({ same: true, unchanged: true });
});

test("exportSvg, downloadSvg and the plugin", async ({ page }) => {
  await openMap(page, "three");
  const plugin = await page.evaluate(async () => {
    const { createSvgExportPlugin, exportSvg, renderSvg } = (window as any).harness;
    const mind = (window as any).__mind;
    const deprecated = mind.exportSvg;
    mind.install(createSvgExportPlugin({ padding: 0 }));
    const viaPlugin = await mind.exportVectorSvg();
    const blob: Blob = await exportSvg(mind, { padding: 0 });
    return {
      same: viaPlugin.svg === (await renderSvg(mind, { padding: 0 })).svg,
      blob: blob.type,
      text: (await blob.text()) === viaPlugin.svg,
      untouched: mind.exportSvg === deprecated,
    };
  });
  expect(plugin).toEqual({ same: true, blob: "image/svg+xml;charset=utf-8", text: true, untouched: true });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(() => (window as any).harness.downloadSvg((window as any).__mind, "mapa.svg")),
  ]);
  expect(download.suggestedFilename()).toBe("mapa.svg");
  const body = Buffer.concat(await (await download.createReadStream()).toArray()).toString("utf8");
  expect(body).toBe((await renderInNode("three")).svg);
});

test("the demo page works offline", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.route(/^https?:/, (route) => route.abort());
  const html = readFileSync(new URL("../../examples/demo/index.html", import.meta.url), "utf8")
    .replace(
      '<link rel="stylesheet" href="dist/mind-elixir.css" />',
      `<style>${readFileSync(new URL("../../examples/demo/dist/mind-elixir.css", import.meta.url), "utf8")}</style>`,
    )
    .replace('<script src="dist/demo.js"></script>', "");
  await page.setContent(html);
  await page.addScriptTag({
    content: readFileSync(new URL("../../examples/demo/dist/demo.js", import.meta.url), "utf8"),
  });
  await page.waitForFunction(() => (document.getElementById("svg") as HTMLImageElement).naturalWidth > 0);
  await expect(page.locator("#size")).toContainText("bytes");
  expect(requests.filter((u) => /^https?:/.test(u))).toEqual([]);
});
