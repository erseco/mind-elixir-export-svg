// How far the renderer's layout (from the data, with Arial metrics) is from what Mind Elixir
// draws in each browser with Arial: the largest difference of any topic's x, y, width and
// height, per map. `npm run compare-layout` writes docs/layout-deviation.json.
import { writeFileSync } from "node:fs";
import { measureLayouts } from "./measure-layout.mjs";

const results = await measureLayouts();
// The baseline file records deviations only. Zoom is a compatibility check, not part of this file.
for (const browser of Object.values(results)) {
  for (const map of Object.values(browser.maps)) {
    delete map.missing;
    delete map.zoom;
    delete map.zoomError;
  }
}
writeFileSync("docs/layout-deviation.json", JSON.stringify(results, null, 2) + "\n");
for (const [browser, r] of Object.entries(results)) {
  console.log(`${browser} ${r.version}`);
  console.table(r.maps);
}
