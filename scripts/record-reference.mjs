// Records the topic boxes Mind Elixir draws in Chromium, with Arial, for the fixtures whose text
// is all in Arial: the unit tests compare the layout with them (tests/unit/reference.json).
//   node scripts/build-harness.mjs && node scripts/record-reference.mjs
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";

const out = await build({
  entryPoints: ["tests/fixtures.ts"],
  bundle: true,
  format: "esm",
  write: false,
  platform: "node",
});
const { FIXTURES } = await import(
  `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`
);
const read = (f) => readFileSync(new URL(`../tests/browser/.harness/${f}`, import.meta.url), "utf8");
const browser = await chromium.launch();
const fixtures = {};
for (const name of ["single", "three", "topDown", "wide", "deep", "large"]) {
  const page = await browser.newPage({ viewport: { width: 2400, height: 1600 } });
  await page.setContent('<div id="map" style="width:2400px;height:1600px"></div>');
  await page.addStyleTag({ content: read("mind-elixir.css") + " .map-container { font-family: Arial !important }" });
  await page.addScriptTag({ content: read("harness.js") });
  fixtures[name] = await page.evaluate((f) => {
    const { MindElixir } = window.harness;
    const mind = new MindElixir({ el: "#map", direction: f.direction ?? 2 });
    mind.init(structuredClone(f.data));
    const o = mind.nodes.getBoundingClientRect();
    const r2 = (v) => Math.round(v * 100) / 100;
    return Object.fromEntries(
      [...mind.nodes.querySelectorAll("me-tpc")].map((t) => {
        const r = t.getBoundingClientRect();
        return [t.dataset.nodeid.slice(2), [r2(r.left - o.left), r2(r.top - o.top), r2(r.width), r2(r.height)]];
      }),
    );
  }, FIXTURES[name]);
  await page.close();
}
const env = {
  chromium: browser.version(),
  mindElixir: createRequire(import.meta.url)("mind-elixir/package.json").version,
  font: "Arial",
};
await browser.close();
writeFileSync("tests/unit/reference.json", JSON.stringify({ env, fixtures }) + "\n");
console.log(env, Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [k, Object.keys(v).length])));
