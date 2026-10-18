import { expect, test } from "@playwright/test";
import { assertValidSvg, editorState, exportMap, openMap } from "./support.js";

test("exportSvg returns an SVG Blob of the same document", async ({ page }) => {
  await openMap(page, "three");
  const out = await page.evaluate(async () => {
    const { exportSvg, renderSvg } = (window as any).harness;
    const mind = (window as any).__mind;
    const blob: Blob = await exportSvg(mind);
    return { type: blob.type, text: await blob.text(), svg: (await renderSvg(mind)).svg };
  });
  expect(out.type).toBe("image/svg+xml;charset=utf-8");
  expect(out.text).toBe(out.svg);
});

test("downloadSvg downloads a file and cleans up", async ({ page }) => {
  await openMap(page, "three");
  const before = await editorState(page);
  await page.evaluate(() => {
    const created: string[] = [];
    const revoked: string[] = [];
    const create = URL.createObjectURL;
    const revoke = URL.revokeObjectURL;
    URL.createObjectURL = (b: Blob) => {
      const u = create(b);
      created.push(u);
      return u;
    };
    URL.revokeObjectURL = (u: string) => {
      revoked.push(u);
      revoke(u);
    };
    (window as any).__urls = { created, revoked };
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.evaluate(() => (window as any).harness.downloadSvg((window as any).__mind, 'mi "mapa"/1.svg')),
  ]);
  // Characters that are not allowed in file names become "_" (one per run of them); browsers may
  // sanitize further (WebKit on Linux also replaces the space)
  expect(download.suggestedFilename()).toMatch(/^mi[ _]_mapa_1\.svg$/);
  const content = await (await download.createReadStream()).toArray();
  expect(Buffer.concat(content).toString("utf8")).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  await page.waitForFunction(() => (window as any).__urls.revoked.length === 1);
  const urls = await page.evaluate(() => (window as any).__urls);
  expect(urls.revoked).toEqual(urls.created);
  expect(await editorState(page)).toEqual(before);
});

test("the plugin adds exportVectorSvg and leaves exportSvg alone", async ({ page }) => {
  await openMap(page, "three");
  const out = await page.evaluate(async () => {
    const { createSvgExportPlugin, renderSvg } = (window as any).harness;
    const mind = (window as any).__mind;
    const deprecated = mind.exportSvg;
    mind.install(createSvgExportPlugin({ padding: 0, title: "Default", limits: { maxNodes: 50 } }));
    const viaPlugin = await mind.exportVectorSvg({ title: "Override", limits: { maxImages: 1 } });
    const direct = await renderSvg(mind, { padding: 0, title: "Override" });
    return {
      same: viaPlugin.svg === direct.svg,
      untouched: mind.exportSvg === deprecated,
      viewBox: viaPlugin.viewBox,
      limit: await mind.exportVectorSvg({ limits: { maxNodes: 1 } }).catch((e: any) => e.code),
    };
  });
  expect(out).toMatchObject({ same: true, untouched: true, limit: "LIMIT_EXCEEDED" });
});

test("repeated exports are identical and leave nothing behind", async ({ page }) => {
  await openMap(page, "features");
  const before = await editorState(page);
  const out = await page.evaluate(async () => {
    const { renderSvg } = (window as any).harness;
    const mind = (window as any).__mind;
    let timers = 0;
    const set = window.setTimeout;
    (window as any).setTimeout = (...args: Parameters<typeof setTimeout>) => {
      timers++;
      return set(...args);
    };
    const svgs = new Set<string>();
    for (let i = 0; i < 20; i++) svgs.add((await renderSvg(mind)).svg);
    (window as any).setTimeout = set;
    return { distinct: svgs.size, timers, styles: document.querySelectorAll("style").length };
  });
  expect(out.distinct).toBe(1);
  // No timer is needed when fonts are already loaded
  expect(out.timers).toBe(0);
  expect(await editorState(page)).toEqual(before);
  expect(out.styles).toBe(await page.evaluate(() => document.querySelectorAll("style").length));
});

test("selection, folding and zoom state are read, not changed", async ({ page }) => {
  await openMap(page, "rich");
  await page.evaluate(() => {
    const mind = (window as any).__mind;
    mind.selectNode(mind.nodes.querySelector("me-root me-tpc"));
    mind.scale(0.8);
  });
  const before = await editorState(page);
  expect(before.selected.length).toBe(1);
  const result = await exportMap(page);
  assertValidSvg(result);
  expect(await editorState(page)).toEqual(before);
  // The selection outline is editor UI: it is not exported
  expect(result.svg).not.toContain('4dc4ff" stroke-width="2"/>');
});
