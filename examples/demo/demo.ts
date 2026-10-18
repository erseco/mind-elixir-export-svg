// The demo page: the editor on the left, the exported SVG (an <img> of the generated file, not
// a screenshot) on the right. Built by scripts/build-harness.mjs; served by `npm run demo`.
import MindElixir from "mind-elixir";
import { downloadSvg, renderSvg } from "../../src/index.js";
import { FIXTURES } from "../../tests/fixtures.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fixtureSelect = $<HTMLSelectElement>("fixture");
const direction = $<HTMLSelectElement>("direction");
const dark = $<HTMLInputElement>("dark");
const zoom = $<HTMLInputElement>("zoom");
const image = $<HTMLImageElement>("svg");
let mind: InstanceType<typeof MindElixir>;
let url = "";

for (const name of ["rich", "features", "unicode", "topDown", "large", "hostile"] as const) {
  fixtureSelect.append(new Option(name, name));
}

function create() {
  const fixture = FIXTURES[fixtureSelect.value as keyof typeof FIXTURES];
  $("map").replaceChildren();
  mind = new MindElixir({
    el: "#map",
    direction: Number(direction.value) as 0 | 1 | 2,
    theme: dark.checked ? MindElixir.DARK_THEME : MindElixir.THEME,
    scaleMax: 2,
  });
  mind.init(structuredClone(fixture.data) as never);
  mind.bus.addListener("operation", () => void update());
  void update();
}

async function update() {
  const start = performance.now();
  const result = await renderSvg(mind, { title: `${fixtureSelect.value} mind map` });
  const ms = performance.now() - start;
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(new Blob([result.svg], { type: "image/svg+xml" }));
  image.src = url;
  image.alt = `${fixtureSelect.value} mind map, exported`;
  const bytes = new TextEncoder().encode(result.svg).length;
  $("size").textContent = `${bytes.toLocaleString()} bytes · ${result.width}×${result.height} · ${ms.toFixed(1)} ms`;
  $("warnings").replaceChildren(
    ...result.warnings.map((w) =>
      Object.assign(document.createElement("li"), { textContent: `${w.code}: ${w.message}` }),
    ),
  );
}

fixtureSelect.addEventListener("change", create);
direction.addEventListener("change", create);
dark.addEventListener("change", create);
zoom.addEventListener("input", () => {
  // Zooming the editor changes nothing in the export: watch the numbers stay the same
  mind.scale(Number(zoom.value));
  void update();
});
$("export").addEventListener("click", () => void update());
$("download").addEventListener("click", () => void downloadSvg(mind, `${fixtureSelect.value}.svg`));
create();
