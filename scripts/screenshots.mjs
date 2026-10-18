// The README's examples: each map in Mind Elixir (a Chromium screenshot of the editor, in Arial)
// next to the SVG this package makes of it. `npm run screenshots` writes docs/images/.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../tests/browser/.harness/${f}`, import.meta.url), "utf8");
const out = "docs/images";
mkdirSync(out, { recursive: true });

let id = 0;
const node = (topic, extra = {}, children = []) => ({
  id: `e${++id}`,
  topic,
  ...extra,
  ...(children.length ? { children } : {}),
});

const photosynthesis = {
  nodeData: node("Photosynthesis", { id: "root" }, [
    node("Inputs", { id: "in", direction: 0 }, [
      node("Light"),
      node("Water", { tags: ["roots"] }),
      node("Carbon dioxide", { tags: ["leaves"] }),
    ]),
    node("Outputs", { id: "out", direction: 1 }, [
      node("Glucose", { id: "glucose", style: { fontWeight: "bold" } }),
      node("Oxygen", { style: { color: "#2e7d32" } }),
    ]),
    node("Stages", { id: "stages", direction: 1 }, [
      node("Light-dependent reactions\nin the thylakoids"),
      node("Calvin cycle", { id: "calvin", style: { background: "#fff3cd", color: "#7a4d00" } }),
    ]),
    node("Where", { direction: 0 }, [node("Chloroplasts", { style: { fontStyle: "italic" } })]),
  ]),
  arrows: [
    { id: "a1", label: "makes", from: "calvin", to: "glucose", delta1: { x: 220, y: 0 }, delta2: { x: 220, y: 0 } },
  ],
  summaries: [{ id: "s1", label: "taken in", parent: "in", start: 1, end: 2 }],
};

const examples = {
  "both-sides": { data: photosynthesis, direction: 2 },
  // Arrow control points are absolute offsets: the one above would cross this layout
  "top-down": { data: { ...photosynthesis, arrows: [] }, direction: 3 },
  dark: { data: photosynthesis, direction: 1, dark: true },
};

const browser = await chromium.launch();
for (const [name, example] of Object.entries(examples)) {
  const page = await browser.newPage({ viewport: { width: 2000, height: 1400 }, deviceScaleFactor: 2 });
  await page.setContent('<body style="margin:0"><div id="map" style="width:2000px;height:1400px"></div>');
  await page.addStyleTag({
    content: `${read("mind-elixir.css")} .map-container { font-family: Arial !important } .mind-elixir-toolbar { display: none !important }`,
  });
  await page.addScriptTag({ content: read("harness.js") });
  const { svg, clip } = await page.evaluate(async (example) => {
    const { MindElixir, renderSvg } = window.harness;
    const mind = new MindElixir({
      el: "#map",
      direction: example.direction,
      ...(example.dark ? { theme: MindElixir.DARK_THEME } : {}),
    });
    mind.init(structuredClone(example.data));
    // The SVG from the instance's data, theme and direction; the screenshot covers the same area
    const result = await renderSvg(mind, { padding: 16 });
    const [vx, vy] = result.viewBox.split(" ").map(Number);
    const r = mind.nodes.getBoundingClientRect();
    const clip = {
      x: Math.round(r.left + vx),
      y: Math.round(r.top + vy),
      width: Math.round(result.width),
      height: Math.round(result.height),
    };
    return { svg: result.svg, clip };
  }, example);
  await page.screenshot({ path: `${out}/${name}-editor.png`, clip });
  writeFileSync(`${out}/${name}.svg`, svg);
  console.log(`${name}: ${clip.width}×${clip.height}, SVG ${svg.length} B`);
  await page.close();
}
await browser.close();
