// How far the renderer's layout (from the data, with Arial metrics) is from what Mind Elixir
// draws in each browser with Arial: the largest difference of any topic's x, y, width and
// height, per map. `npm run compare-layout` writes docs/layout-deviation.json.
import { chromium, firefox, webkit } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const load = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, format: "esm", write: false, platform: "node" });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
};
const { FIXTURES } = await load("tests/fixtures.ts");
const { layout } = await load("scripts/layout-entry.ts");
const read = (f) => readFileSync(new URL(`../tests/browser/.harness/${f}`, import.meta.url), "utf8");
const names = ["three", "topDown", "wide", "deep", "large", "rich", "features", "unicode"];

const results = {};
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await type.launch();
  results[name] = { version: browser.version(), maps: {} };
  for (const fixture of names) {
    const f = FIXTURES[fixture];
    const page = await browser.newPage({ viewport: { width: 2400, height: 1600 } });
    await page.setContent('<div id="map" style="width:2400px;height:1600px"></div>');
    await page.addStyleTag({ content: read("mind-elixir.css") + " .map-container { font-family: Arial !important }" });
    await page.addScriptTag({ content: read("harness.js") });
    const editor = await page.evaluate((f) => {
      const { MindElixir } = window.harness;
      const mind = new MindElixir({ el: "#map", direction: f.direction ?? 2 });
      mind.init(structuredClone(f.data));
      const o = mind.nodes.getBoundingClientRect();
      return [...mind.nodes.querySelectorAll("me-tpc")].map((t) => {
        const r = t.getBoundingClientRect();
        return {
          id: t.dataset.nodeid.slice(2),
          x: r.left - o.left,
          y: r.top - o.top,
          width: r.width,
          height: r.height,
        };
      });
    }, f);
    await page.close();
    const boxes = layout({ ...f.data, direction: f.direction ?? 2 });
    const d = { x: 0, y: 0, width: 0, height: 0 };
    for (const e of editor) for (const k of Object.keys(d)) d[k] = Math.max(d[k], Math.abs(boxes[e.id][k] - e[k]));
    results[name].maps[fixture] = {
      topics: editor.length,
      ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, +v.toFixed(2)])),
    };
  }
  await browser.close();
}
writeFileSync("docs/layout-deviation.json", JSON.stringify(results, null, 2) + "\n");
for (const [browser, r] of Object.entries(results)) {
  console.log(`${browser} ${r.version}`);
  console.table(r.maps);
}
