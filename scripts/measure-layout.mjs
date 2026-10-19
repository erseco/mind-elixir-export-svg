// Measures topic boxes from the bundled Mind Elixir harness against this renderer's layout.
// `compare-layout.mjs` records the supported baseline. `compat.mjs` uses the same measurement
// for any Mind Elixir version, and does not write the baseline.
import { chromium, firefox, webkit } from "@playwright/test";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const load = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, format: "esm", write: false, platform: "node" });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
};

const read = (f) => readFileSync(new URL(`../tests/browser/.harness/${f}`, import.meta.url), "utf8");

/**
 * @param {{ fixtures?: string[], checkZoom?: boolean, tolerateErrors?: boolean }} [options]
 * @returns {Promise<Record<string, { version: string, maps: Record<string, object>, zoom?: object }>>}
 */
export async function measureLayouts(options = {}) {
  const { FIXTURES } = await load("tests/fixtures.ts");
  const { layout } = await load("scripts/layout-entry.ts");
  const names = options.fixtures ?? ["three", "topDown", "wide", "deep", "large", "rich", "features", "unicode"];
  const results = {};
  for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await type.launch();
    results[name] = { version: browser.version(), maps: {} };
    try {
      for (const fixture of names) {
        const f = FIXTURES[fixture];
        const page = await browser.newPage({ viewport: { width: 2400, height: 1600 } });
        try {
          await page.setContent('<div id="map" style="width:2400px;height:1600px"></div>');
          await page.addStyleTag({
            content: read("mind-elixir.css") + " .map-container { font-family: Arial !important }",
          });
          await page.addScriptTag({ content: read("harness.js") });
          const measured = await page.evaluate(
            async ({ f, checkZoom }) => {
              const { MindElixir } = window.harness;
              const mind = new MindElixir({ el: "#map", direction: f.direction ?? 2 });
              mind.init(structuredClone(f.data));
              // 5.15.1 uses a custom element. 6.0 uses a div with the same class.
              // getBoundingClientRect includes the canvas scale, so divide by scaleVal.
              const boxes = () => {
                const scale = typeof mind.scaleVal === "number" && mind.scaleVal > 0 ? mind.scaleVal : 1;
                const o = mind.nodes.getBoundingClientRect();
                return [...mind.nodes.querySelectorAll("me-tpc, .me-tpc")].map((t) => {
                  const r = t.getBoundingClientRect();
                  const fromNode = t.nodeObj && typeof t.nodeObj.id === "string" ? t.nodeObj.id : "";
                  return {
                    id: fromNode || String(t.dataset.nodeid || "").slice(2),
                    x: (r.left - o.left) / scale,
                    y: (r.top - o.top) / scale,
                    width: r.width / scale,
                    height: r.height / scale,
                  };
                });
              };
              const editor = boxes();
              if (editor.length === 0) {
                throw new Error("Mind Elixir drew no topics. me-tpc and .me-tpc matched nothing.");
              }
              let zoom;
              if (checkZoom && typeof mind.scale === "function") {
                zoom = {};
                for (const scale of [0.5, 1.25]) {
                  mind.scale(scale);
                  const next = boxes();
                  let max = 0;
                  for (const box of editor) {
                    const other = next.find((n) => n.id === box.id);
                    if (!other) return { editor, zoomError: `topic ${box.id} missing at scale ${scale}` };
                    max = Math.max(
                      max,
                      Math.abs(other.x - box.x),
                      Math.abs(other.y - box.y),
                      Math.abs(other.width - box.width),
                      Math.abs(other.height - box.height),
                    );
                  }
                  zoom[String(scale)] = max;
                }
              }
              return { editor, zoom };
            },
            { f, checkZoom: options.checkZoom === true && fixture === "three" },
          );
          const boxes = layout({ ...f.data, direction: f.direction ?? 2 });
          const d = { x: 0, y: 0, width: 0, height: 0 };
          let missing = 0;
          const seen = new Set();
          for (const e of measured.editor) {
            seen.add(e.id);
            const box = boxes[e.id];
            if (!box) {
              missing++;
              continue;
            }
            for (const k of Object.keys(d)) d[k] = Math.max(d[k], Math.abs(box[k] - e[k]));
          }
          for (const id of Object.keys(boxes)) if (!seen.has(id)) missing++;
          results[name].maps[fixture] = {
            topics: measured.editor.length,
            missing,
            ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, +v.toFixed(2)])),
            ...(measured.zoom ? { zoom: measured.zoom } : {}),
            ...(measured.zoomError ? { zoomError: measured.zoomError } : {}),
          };
          if (options.checkZoom && fixture === "three" && measured.zoom) results[name].zoom = measured.zoom;
        } catch (error) {
          if (!options.tolerateErrors) throw error;
          results[name].maps[fixture] = { error: error instanceof Error ? error.message : String(error) };
        } finally {
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  }
  return results;
}
