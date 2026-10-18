// Measures this exporter against the other ways of publishing a Mind Elixir map, on the same
// maps, in Chromium: `npm run bench` (writes docs/benchmarks.json and prints a table).
//
//   svg      this package (renderSvg, in Node: no browser)
//   png      modern-screenshot domToPng of the map in Mind Elixir (a screenshot export, in Chromium)
//   mermaid  @erseco/mind-elixir-export-mermaid source, and Pele's SVG of it
//   legacy   Mind Elixir's deprecated mind.exportSvg()
//
// Durations are the median of RUNS exports after one warm-up; sizes are bytes (gzip -9).
import { chromium } from "@playwright/test";
import { mindElixirToMermaid } from "@erseco/mind-elixir-export-mermaid";
import { render as pele } from "pele";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";

const RUNS = Number(process.env.RUNS ?? 7);
const read = (f) => readFileSync(new URL(`../tests/browser/.harness/${f}`, import.meta.url), "utf8");
const gz = (s) => gzipSync(Buffer.from(s), { level: 9 }).length;
const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
async function timeNode(fn) {
  await fn();
  const ms = [];
  let value;
  for (let i = 0; i < RUNS; i++) {
    const t = performance.now();
    value = await fn();
    ms.push(performance.now() - t);
  }
  return { value, ms: median(ms) };
}

// The fixtures are TypeScript; esbuild turns them into a module we can import
const { build } = await import("esbuild");
const out = await build({
  entryPoints: ["tests/fixtures.ts"],
  bundle: true,
  format: "esm",
  write: false,
  platform: "node",
});
const { FIXTURES, visibleTopics } = await import(
  `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`
);
const lib = await build({ entryPoints: ["src/index.ts"], bundle: true, format: "esm", write: false, platform: "node" });
const { renderSvg } = await import(
  `data:text/javascript;base64,${Buffer.from(lib.outputFiles[0].text).toString("base64")}`
);

const browser = await chromium.launch();
const results = [];
for (const name of ["three", "rich", "large"]) {
  const fixture = FIXTURES[name];
  const page = await browser.newPage({ viewport: { width: 2400, height: 3200 } });
  await page.setContent('<div id="map" style="width:2400px;height:3200px"></div>');
  await page.addStyleTag({ content: read("mind-elixir.css") });
  await page.addScriptTag({ content: read("harness.js") });
  await page.addScriptTag({ content: read("bench-harness.js") });
  const measured = await page.evaluate(
    async ({ fixture, RUNS }) => {
      const { MindElixir } = window.harness;
      const mind = new MindElixir({ el: "#map", direction: fixture.direction ?? 2 });
      mind.init(structuredClone(fixture.data));
      const time = async (fn) => {
        await fn();
        const ms = [];
        let value;
        for (let i = 0; i < RUNS; i++) {
          const t = performance.now();
          value = await fn();
          ms.push(performance.now() - t);
        }
        ms.sort((a, b) => a - b);
        return { value, ms: ms[Math.floor(ms.length / 2)] };
      };
      const png = await time(() => window.bench.domToPng(mind.nodes, { backgroundColor: "#ffffff", scale: 1 }));
      const legacy = await time(async () => await mind.exportSvg().text());
      const pngBytes = atob(png.value.split(",")[1]).length;
      return {
        nodes: mind.nodes.querySelectorAll("me-tpc").length,
        png: { bytes: pngBytes, ms: png.ms },
        legacy: { text: legacy.value, ms: legacy.ms },
        data: mind.getData(),
      };
    },
    { fixture, RUNS },
  );
  await page.close();
  const svgRun = await timeNode(() => renderSvg({ ...fixture.data, direction: fixture.direction ?? 2 }));
  measured.svg = { text: svgRun.value.svg, ms: svgRun.ms, warnings: svgRun.value.warnings.length };
  const mermaid = mindElixirToMermaid(measured.data, { markdown: true, omitCollapsed: true });
  const peleSvg = pele(mermaid).svg;
  const text = measured.svg.text.replace(/<[^>]+>/g, "");
  const topics = visibleTopics(fixture);
  const complete = topics.filter((t) =>
    text
      .replace(/\s+/g, "")
      .includes(
        t
          .replace(/\s+/g, "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;"),
      ),
  ).length;
  results.push({
    fixture: name,
    nodes: measured.nodes,
    svg: {
      bytes: Buffer.byteLength(measured.svg.text),
      gzip: gz(measured.svg.text),
      ms: +measured.svg.ms.toFixed(1),
      warnings: measured.svg.warnings,
      topics: `${complete}/${topics.length}`,
    },
    png: { bytes: measured.png.bytes, ms: +measured.png.ms.toFixed(1) },
    mermaid: {
      bytes: Buffer.byteLength(mermaid),
      gzip: gz(mermaid),
      peleSvgBytes: Buffer.byteLength(peleSvg),
      peleSvgGzip: gz(peleSvg),
    },
    legacySvg: {
      bytes: Buffer.byteLength(measured.legacy.text),
      gzip: gz(measured.legacy.text),
      ms: +measured.legacy.ms.toFixed(1),
      foreignObject: (measured.legacy.text.match(/<foreignObject/g) ?? []).length,
    },
  });
}
const version = (p) => createRequire(import.meta.url)(`${p}/package.json`).version;
const env = {
  date: new Date().toISOString(),
  chromium: browser.version(),
  node: process.version,
  runs: RUNS,
  mindElixir: version("mind-elixir"),
  modernScreenshot: version("modern-screenshot"),
  pele: version("pele"),
};
await browser.close();
writeFileSync("docs/benchmarks.json", JSON.stringify({ env, results }, null, 2) + "\n");
console.log(JSON.stringify(env));
console.table(
  results.map((r) => ({
    map: `${r.fixture} (${r.nodes})`,
    "svg B": r.svg.bytes,
    "svg gz": r.svg.gzip,
    "svg ms": r.svg.ms,
    topics: r.svg.topics,
    "png B": r.png.bytes,
    "png ms": r.png.ms,
    "mmd B": r.mermaid.bytes,
    "pele svg B": r.mermaid.peleSvgBytes,
    "legacy B": r.legacySvg.bytes,
    "legacy fO": r.legacySvg.foreignObject,
  })),
);
